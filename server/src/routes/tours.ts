import { Router } from "express";
import { json, prisma } from "../db.js";
import { computeMatch, pickBadge } from "../lib/match.js";
import { computeRating, computeRatingsBatch, type LiveRating } from "../lib/ratings.js";
import { computePopularityBatch } from "../lib/popularity.js";
import { catalogToTopo, cityCoords } from "../lib/geo.js";
import { type AuthedRequest } from "../middleware/auth.js";

export const toursRouter = Router();

/** Lazily-loaded current user prefs — cached per request so we don't refetch per tour. */
type UserCtx = { budgetFrom: number | null; budgetTo: number | null; favThemes: string[]; companion: string | null };
async function loadUserCtx(userId?: number): Promise<UserCtx | null> {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  return {
    budgetFrom: u.budgetFrom,
    budgetTo: u.budgetTo,
    favThemes: json.parse<string[]>(u.favThemes, []),
    companion: u.companion,
  };
}

/**
 * Pre-computed batch context. Building it ONCE for a list of tours and
 * passing it into `serializeTour` per-tour reduces queries from O(4×N)
 * to O(constant) regardless of list length.
 */
interface SerializeBatch {
  ratings: Map<number, LiveRating>;
  organizers: Map<number, OrganizerSerialized | null>;
}

interface OrganizerSerialized {
  slug: string; name: string; type: string; bio: string;
  email: string; phone: string; whatsapp?: string;
  rating: number | null; reviewsCount: number; toursCount: number;
  yearsActive: number;
}

/**
 * Build the batch context for the given tour ids. Issues a fixed number
 * of queries (4) regardless of how many tours we serialise.
 */
async function buildSerializeBatch(
  tours: Pick<Awaited<ReturnType<typeof prisma.tour.findFirstOrThrow>>, "id" | "organizerId">[],
): Promise<SerializeBatch> {
  const tourIds = tours.map((t) => t.id);
  const organizerIds = [...new Set(tours.map((t) => t.organizerId).filter((x): x is number => x != null))];

  // (1) live ratings for every tour in one groupBy
  const ratings = await computeRatingsBatch(tourIds);

  // (2) the organizer records themselves
  const organizerRows = organizerIds.length
    ? await prisma.organizer.findMany({ where: { id: { in: organizerIds } } })
    : [];

  // (3) all tours that belong to those organizers (to count + later get ratings)
  const allOrganizerTours = organizerIds.length
    ? await prisma.tour.findMany({
        where: { organizerId: { in: organizerIds } },
        select: { id: true, organizerId: true },
      })
    : [];

  // (4) review aggregations grouped by tour, for tours that belong to any of
  //     those organizers. Then we fold by organizerId.
  const allOrganizerTourIds = allOrganizerTours.map((t) => t.id);
  const operatorReviewRows = allOrganizerTourIds.length
    ? await prisma.review.groupBy({
        by: ["tourId"],
        where: { tourId: { in: allOrganizerTourIds } },
        _count: { id: true },
        _avg: { rating: true },
      })
    : [];

  // Index review aggregations by tourId → fold into per-organizer totals.
  const reviewsByTour = new Map<number, { count: number; sum: number }>();
  for (const r of operatorReviewRows) {
    reviewsByTour.set(r.tourId, {
      count: r._count.id,
      sum: (r._avg.rating ?? 0) * r._count.id,
    });
  }
  const toursByOrganizer = new Map<number, number[]>();
  for (const ot of allOrganizerTours) {
    if (ot.organizerId == null) continue;
    const arr = toursByOrganizer.get(ot.organizerId) ?? [];
    arr.push(ot.id);
    toursByOrganizer.set(ot.organizerId, arr);
  }

  const organizers = new Map<number, OrganizerSerialized | null>();
  for (const o of organizerRows) {
    const ownTourIds = toursByOrganizer.get(o.id) ?? [];
    let count = 0;
    let sum = 0;
    for (const tid of ownTourIds) {
      const r = reviewsByTour.get(tid);
      if (r) {
        count += r.count;
        sum += r.sum;
      }
    }
    organizers.set(o.id, {
      slug: o.slug,
      name: o.name,
      type: o.type,
      bio: o.bio,
      email: o.email,
      phone: o.phone,
      whatsapp: o.whatsapp ?? undefined,
      rating: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
      reviewsCount: count,
      toursCount: ownTourIds.length,
      yearsActive: o.yearsActive,
    });
  }

  return { ratings, organizers };
}

/**
 * Serialize one tour. Single-row endpoints can call without `batch` (in
 * which case we issue the inline queries); list endpoints should always
 * pre-build a batch and pass it in.
 */
async function serializeTour(
  t: Awaited<ReturnType<typeof prisma.tour.findFirstOrThrow>>,
  userCtx: UserCtx | null = null,
  batch?: SerializeBatch,
) {
  const live = batch?.ratings.get(t.id) ?? await computeRating(t.id);
  const tourThemes = json.parse<string[]>(t.themes, []);

  // Personal match score (only when authed) → may produce an "ai" badge
  const match = userCtx
    ? computeMatch({
        tourPrice: t.price,
        tourThemes,
        tourMeal: t.meal,
        tourStars: t.hotelStars,
        tourDuration: t.durationNights,
        user: userCtx,
      })
    : null;
  const liveBadge = pickBadge({
    manualBadge: t.badge,
    matchScore: match?.score ?? null,
    price: t.price,
    oldPrice: t.oldPrice ?? null,
  });
  let organizer: OrganizerSerialized | null = null;

  if (t.organizerId) {
    if (batch) {
      organizer = batch.organizers.get(t.organizerId) ?? null;
    } else {
      // Fallback for single-tour endpoint — inline the 3 queries we used to do.
      const o = await prisma.organizer.findUnique({ where: { id: t.organizerId } });
      if (o) {
        const ownTours = await prisma.tour.findMany({ where: { organizerId: o.id }, select: { id: true } });
        const agg = await prisma.review.aggregate({
          where: { tourId: { in: ownTours.map((x) => x.id) } },
          _count: { id: true }, _avg: { rating: true },
        });
        organizer = {
          slug: o.slug,
          name: o.name,
          type: o.type,
          bio: o.bio,
          email: o.email,
          phone: o.phone,
          whatsapp: o.whatsapp ?? undefined,
          rating: agg._count.id > 0 ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : null,
          reviewsCount: agg._count.id,
          toursCount: ownTours.length,
          yearsActive: o.yearsActive,
        };
      }
    }
  }

  return {
    id: t.slug,
    country: t.country,
    city: t.city,
    region: t.region,
    title: t.title,
    shortDescription: t.shortDescription,
    description: t.description,
    highlights: json.parse<string[]>(t.highlights, []),
    included:   json.parse<string[]>(t.included, []),
    excluded:   json.parse<string[]>(t.excluded, []),
    program:    json.parse<{ day: number; title: string; text: string }[]>(t.program, []),
    themes:     json.parse<string[]>(t.themes, []),
    durationNights: t.durationNights,
    hotelStars: t.hotelStars,
    meal: t.meal,
    price: t.price,
    oldPrice: t.oldPrice ?? undefined,
    rating: live.rating,
    reviews: live.reviews,
    badge: liveBadge ?? undefined,
    matchScore: match?.score,
    emoji: t.emoji,
    gradient: t.gradient,
    imageCount: t.imageCount,
    popularity: t.popularity,
    organizer,
    // Departures are exposed as an array of ISO dates the client can use for
    // the date picker. Past dates are filtered server-side so the UI doesn't
    // have to know "today".
    departures: filterFutureDates(json.parse<string[]>(t.departures, [])),
    publishedAt: t.publishedAt.toISOString(),
    createdAt: t.createdAt.toISOString().slice(0, 10),
  };
}

/** Drop dates that are in the past — clients shouldn't pick yesterday. */
function filterFutureDates(dates: string[]): string[] {
  const today = new Date().toISOString().slice(0, 10);
  return dates.filter((d) => d >= today);
}

/**
 * By default, listings only return tours that have at least 1 image
 * (hero present). Useful so the catalog doesn't show emoji-only placeholders.
 * Override with ?includeIncomplete=true for debugging.
 */
function imageFilter(includeIncomplete: string | undefined) {
  return includeIncomplete === "true" ? {} : { imageCount: { gt: 0 } };
}

/**
 * Public listings only show tours admins have actively approved. Pending,
 * disabled and rejected tours are filtered out — organizers see their own
 * via /api/organizer/tours which has the full set.
 */
const PUBLIC_STATUS = { status: "active" } as const;

// GET /api/tours — with filters, sorting and offset-based pagination.
// Response is { items: Tour[], total: number } so the client can render
// an infinite-scroll grid without needing a separate count endpoint.
toursRouter.get("/", async (req: AuthedRequest, res) => {
  const {
    themes,
    priceMin,
    priceMax,
    nightsMin,
    nightsMax,
    stars,
    countries,
    meals,
    discount,
    q,
    sort = "popular",
    limit = "24",
    offset = "0",
    includeIncomplete,
    departFrom,
    departTo,
  } = req.query as Record<string, string | undefined>;

  const where: Parameters<typeof prisma.tour.findMany>[0] = { where: {} };
  const conditions: Record<string, unknown> = { ...imageFilter(includeIncomplete), ...PUBLIC_STATUS };

  if (priceMin) conditions.price = { ...(conditions.price as object), gte: Number(priceMin) };
  if (priceMax) conditions.price = { ...(conditions.price as object), lte: Number(priceMax) };
  if (nightsMin) conditions.durationNights = { ...(conditions.durationNights as object), gte: Number(nightsMin) };
  if (nightsMax) conditions.durationNights = { ...(conditions.durationNights as object), lte: Number(nightsMax) };
  if (discount === "true") conditions.oldPrice = { not: null };

  if (stars) {
    const arr = stars.split(",").map(Number).filter(Boolean);
    if (arr.length) conditions.hotelStars = { in: arr };
  }
  if (countries) {
    const arr = countries.split(",").filter(Boolean);
    if (arr.length) conditions.country = { in: arr };
  }
  if (meals) {
    const arr = meals.split(",").filter(Boolean);
    if (arr.length) conditions.meal = { in: arr };
  }
  if (q) {
    conditions.OR = [
      { title:   { contains: q } },
      { city:    { contains: q } },
      { country: { contains: q } },
    ];
  }

  // Theme filter — push into SQL as a chain of `contains` over the JSON
  // string column. Pre-DB: previously this was an in-memory filter applied
  // AFTER `take: 30`, which gave wrong counts (a niche theme could end up
  // showing 0 results because the top-30-by-popularity didn't contain it).
  // Now Prisma generates `WHERE themes LIKE '%"water"%' OR themes LIKE ...`.
  // Note: LIKE with leading wildcard can't use the @@index([themes]) — a
  // proper join-table denormalization would be next step when we hit ~5k
  // tours. For ≤1k tours this is faster + correct.
  if (themes) {
    const want = themes.split(",").filter(Boolean);
    if (want.length) {
      const themeOR = want.map((th) => ({ themes: { contains: `"${th}"` } }));
      if (conditions.OR) {
        // Combine with existing search-query OR using AND wrapper
        conditions.AND = [
          { OR: conditions.OR },
          { OR: themeOR },
        ];
        delete conditions.OR;
      } else {
        conditions.OR = themeOR;
      }
    }
  }

  // Pagination — `limit` (default 24) is the page size; `offset` is how
  // many tours to skip. SQL-side `orderBy` is REQUIRED for stable paging
  // (Prisma without orderBy returns rows in insertion order in SQLite,
  // which made newly-created tours land beyond the historical first 60
  // — a bug surfaced in May 2026 when a moderator's freshly-approved
  // tour kept "disappearing" from the catalog despite being in the DB).
  const requestedLimit = Math.min(Number(limit) || 24, 60);
  const requestedOffset = Math.max(Number(offset) || 0, 0);

  // The post-fetch Node-side sort below produces the FINAL order for
  // popularity/rating/duration/etc.; the SQL orderBy here only matters
  // for keeping pagination boundaries stable. Sorting by `popularity DESC`
  // first puts seeded popular tours near the top; the secondary `id DESC`
  // breaks ties deterministically so page 1 and page 2 don't overlap.
  const total = await prisma.tour.count({ where: conditions });
  let rows = await prisma.tour.findMany({
    where: conditions,
    orderBy: [{ popularity: "desc" }, { id: "desc" }],
    take: requestedLimit,
    skip: requestedOffset,
  });

  // Date filter — applied AFTER DB query because departures is a JSON string.
  // Cheap (≤200 rows in memory) and tolerant of past dates / empty lists.
  // departFrom/departTo are YYYY-MM-DD strings. If only `departFrom` is set,
  // we keep tours that have any departure on or after that date.
  if (departFrom || departTo) {
    rows = rows.filter((t) => {
      const departures = json.parse<string[]>(t.departures, []);
      if (departures.length === 0) return false; // exclude flexible-only tours from a strict date search
      return departures.some((d) => {
        if (departFrom && d < departFrom) return false;
        if (departTo && d > departTo) return false;
        return true;
      });
    });
  }

  // Sorting
  switch (sort) {
    case "price-asc":  rows.sort((a, b) => a.price - b.price); break;
    case "price-desc": rows.sort((a, b) => b.price - a.price); break;
    case "rating":     rows.sort((a, b) => b.rating - a.rating); break;
    case "newest":     rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); break;
    case "discount":
      rows.sort((a, b) => {
        const da = a.oldPrice ? 1 - a.price / a.oldPrice : 0;
        const db = b.oldPrice ? 1 - b.price / b.oldPrice : 0;
        return db - da;
      });
      break;
    case "duration":   rows.sort((a, b) => a.durationNights - b.durationNights); break;
    case "popular":
    default: {
      // Live popularity = real activity (bookings/reviews/saves/AI mentions)
      // + a soft anchor from the seed value. See lib/popularity.ts.
      const pop = await computePopularityBatch(rows.map((r) => r.id));
      rows.sort((a, b) => (pop.get(b.id)?.score ?? 0) - (pop.get(a.id)?.score ?? 0));
      break;
    }
  }

  const userCtx = await loadUserCtx(req.userId);
  if (!req.userId) {
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  } else {
    res.setHeader("Cache-Control", "private, max-age=30");
  }
  // Pre-compute batch context once for the whole list (4 queries total)
  // instead of running 4 inline queries per tour (would be 4 × rows.length).
  const batch = await buildSerializeBatch(rows);
  const items = await Promise.all(rows.map((t) => serializeTour(t, userCtx, batch)));

  // Bounds — min/max of price and durationNights across the WHOLE
  // matching dataset (not just the current page). The catalog UI uses
  // these to anchor the range sliders so the user can pick across the
  // real cheapest→most-expensive band instead of an arbitrary 0–100000.
  // Only sent with the first page (offset=0) — the client caches it
  // and reuses across page loads.
  let bounds: { priceMin: number; priceMax: number; nightsMin: number; nightsMax: number } | undefined;
  if (requestedOffset === 0) {
    const agg = await prisma.tour.aggregate({
      where: conditions,
      _min: { price: true, durationNights: true },
      _max: { price: true, durationNights: true },
    });
    bounds = {
      priceMin: agg._min.price ?? 0,
      priceMax: agg._max.price ?? 10000,
      nightsMin: agg._min.durationNights ?? 1,
      nightsMax: agg._max.durationNights ?? 30,
    };
  }
  res.json({ items, total, bounds });
});

// GET /api/tours/map-data
//
// Returns aggregated geo data used by the world-map hero:
//   countries[] — countries that have tours, with the topo-name and tour count
//   cities[]    — cities with at least one tour AND known coords
//
// Notes:
//   - Cities whose name isn't in `cityCoords` are skipped (with a server warn).
//     Add them to `server/src/lib/geo.ts` when needed.
//   - Countries whose name doesn't match world-atlas TopoJSON would just not
//     light up on the map. Use `catalogToTopo` to add aliases.
toursRouter.get("/map-data", async (_req, res) => {
  const grouped = await prisma.tour.groupBy({
    by: ["country", "city"],
    where: { imageCount: { gt: 0 }, status: "active" },
    _count: { _all: true },
  });

  // Countries (sum across all their cities)
  const countryTotals = new Map<string, number>();
  for (const row of grouped) {
    countryTotals.set(row.country, (countryTotals.get(row.country) ?? 0) + row._count._all);
  }
  const countries = [...countryTotals.entries()].map(([name, tours]) => ({
    name,
    topoName: catalogToTopo[name] ?? name,
    tours,
  }));

  // Cities — keep only those we have coords for
  const cities: { name: string; country: string; coords: [number, number]; tours: number }[] = [];
  const missing = new Set<string>();
  for (const row of grouped) {
    const coords = cityCoords[row.city];
    if (!coords) {
      missing.add(`${row.city} (${row.country})`);
      continue;
    }
    cities.push({
      name: row.city,
      country: row.country,
      coords,
      tours: row._count._all,
    });
  }
  // Catalogue coord gaps are devtime feedback only — fixing them is a
  // code change (add to lib/geo.ts). In prod the request handler shouldn't
  // log on every call, that's just noise.
  if (missing.size > 0 && process.env.NODE_ENV !== "production") {
    console.warn(`[map-data] ${missing.size} cities missing coords:`, [...missing].slice(0, 20).join(", "));
  }

  // Map data changes only when the catalog changes (new tour added /
  // imageCount drops to 0). Cache aggressively — 5 min browser, 30 min
  // shared/CDN. stale-while-revalidate lets clients keep an old copy
  // visible while a refresh happens in the background.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400");
  res.json({ countries, cities });
});

// GET /api/tours/:slug
toursRouter.get("/:slug", async (req: AuthedRequest, res) => {
  const tour = await prisma.tour.findUnique({ where: { slug: String(req.params.slug) } });
  // Hide non-active tours from the public endpoint. Operators view drafts
  // via /api/organizer/tours and admins via /api/admin/tours/:slug.
  if (!tour || tour.status !== "active") {
    res.status(404).json({ error: "not found" });
    return;
  }
  const userCtx = await loadUserCtx(req.userId);
  if (!req.userId) {
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600");
  } else {
    res.setHeader("Cache-Control", "private, max-age=60");
  }
  res.json(await serializeTour(tour, userCtx));
});
