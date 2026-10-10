/**
 * Real popularity scoring — derives "how hot is this tour" from actual
 * user activity, not just the seeded number. This is what powers:
 *   - sort=popular on /api/tours
 *   - /api/analytics/summary endpoint (for the diploma report)
 *
 * Formula:
 *   score = bookings * 5  +  reviews * 3  +  saves * 2  +  ai-mentions * 1
 *           +  seed_popularity * 0.5
 *
 * Weights reflect signal strength:
 *   - bookings (5): strongest — user actually paid
 *   - reviews (3): user completed the trip + felt like talking about it
 *   - saves (2): genuine interest, no commitment yet
 *   - ai-mentions (1): user asked the AI about this tour or destination
 *   - seed (0.5): keeps cold-start ordering stable when activity is sparse
 */
import { prisma } from "../db.js";

export interface TourActivity {
  bookings: number;
  reviews: number;
  saves: number;
  aiMentions: number;
  /** Seeded `Tour.popularity` — kept as a soft anchor so new sites don't all tie at zero. */
  seed: number;
  /** Derived weighted score. */
  score: number;
}

const W_BOOKING = 5;
const W_REVIEW = 3;
const W_SAVE = 2;
const W_AI = 1;
const W_SEED = 0.5;

function scoreOf(a: Omit<TourActivity, "score">): number {
  return (
    a.bookings * W_BOOKING +
    a.reviews * W_REVIEW +
    a.saves * W_SAVE +
    a.aiMentions * W_AI +
    a.seed * W_SEED
  );
}

/**
 * Pull activity counts for many tours in one batch. Used by the catalog
 * route when sorting by "popular" — fetches counts in 4 parallel DB queries
 * rather than N per tour.
 */
export async function computePopularityBatch(
  tourIds: number[]
): Promise<Map<number, TourActivity>> {
  if (tourIds.length === 0) return new Map();

  const [bookingAgg, reviewAgg, savedAgg, tourRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["tourId"],
      where: { tourId: { in: tourIds } },
      _count: { id: true },
    }),
    prisma.review.groupBy({
      by: ["tourId"],
      where: { tourId: { in: tourIds } },
      _count: { id: true },
    }),
    prisma.savedTour.groupBy({
      by: ["tourId"],
      where: { tourId: { in: tourIds } },
      // SavedTour uses a compound primary key (userId+tourId), no `id` column
      // — _count: { _all: true } counts rows in each group.
      _count: { _all: true },
    }),
    prisma.tour.findMany({
      where: { id: { in: tourIds } },
      select: { id: true, slug: true, popularity: true, country: true, city: true },
    }),
  ]);

  // ai-mentions: count AiQuery rows whose `tourIds` JSON or `query` text
  // mentions this tour's slug / city. We do a single fetch and a simple
  // string search — for a catalog of <1000 tours this is fast enough.
  // (For larger systems, denormalise this into a per-tour counter.)
  const aiRows = await prisma.aiQuery.findMany({
    select: { tourIds: true, query: true },
    take: 5000,
    orderBy: { createdAt: "desc" },
  });
  const aiMentionsByTourId = new Map<number, number>();
  for (const t of tourRows) {
    let n = 0;
    const slugMarker = `"${t.slug}"`;
    const cityLower = t.city.toLowerCase();
    for (const a of aiRows) {
      if (a.tourIds.includes(slugMarker)) n++;
      else if (a.query.toLowerCase().includes(cityLower)) n++;
    }
    aiMentionsByTourId.set(t.id, n);
  }

  const bookingMap = new Map(bookingAgg.map((g) => [g.tourId, g._count?.id ?? 0]));
  const reviewMap  = new Map(reviewAgg.map((g)  => [g.tourId, g._count?.id ?? 0]));
  const savedMap   = new Map(savedAgg.map((g)   => [g.tourId, g._count?._all ?? 0]));
  const seedMap    = new Map(tourRows.map((t)   => [t.id,     t.popularity]));

  const out = new Map<number, TourActivity>();
  for (const id of tourIds) {
    const stats = {
      bookings:   bookingMap.get(id) ?? 0,
      reviews:    reviewMap.get(id)  ?? 0,
      saves:      savedMap.get(id)   ?? 0,
      aiMentions: aiMentionsByTourId.get(id) ?? 0,
      seed:       seedMap.get(id)    ?? 0,
    };
    out.set(id, { ...stats, score: scoreOf(stats) });
  }
  return out;
}
