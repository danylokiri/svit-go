import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { json, prisma } from "../db.js";
import {
  type AuthedRequest,
  requireOrganizer,
  signOrganizerToken,
} from "../middleware/auth.js";

export const organizersRouter = Router();

// ---------------------------------------------------------------------------
//  Auth — organizers log in with their public email + a password.
//  In the demo seed they all share `operator2026`; in real life this would
//  be a per-invite link with a forced password change.
// ---------------------------------------------------------------------------
const orgLoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(72),
});

organizersRouter.post("/auth/login", async (req, res) => {
  const parsed = orgLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const org = await prisma.organizer.findUnique({ where: { email } });
  if (!org || !org.passwordHash) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(password, org.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const token = signOrganizerToken(org.id);
  res.json({ token, organizer: publicOrganizer(org) });
});

organizersRouter.get("/auth/me", requireOrganizer, async (req: AuthedRequest, res) => {
  const org = await prisma.organizer.findUnique({ where: { id: req.organizerId! } });
  if (!org) {
    res.status(404).json({ error: "organizer not found" });
    return;
  }
  res.json(publicOrganizer(org));
});

function publicOrganizer(o: Awaited<ReturnType<typeof prisma.organizer.findFirstOrThrow>>) {
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    type: o.type,
    bio: o.bio,
    email: o.email,
    phone: o.phone,
    whatsapp: o.whatsapp ?? null,
    yearsActive: o.yearsActive,
    avatarUrl: o.avatarUrl ?? null,
    verified: o.verified,
    createdAt: o.createdAt.toISOString(),
  };
}

/**
 * GET /api/organizers/:slug
 *
 * Returns operator profile with:
 *   - basic info (type, bio, contacts, yearsActive)
 *   - live rating  (avg of all reviews on all of their tours, or null)
 *   - live tripsRun (count of completed bookings on their tours)
 *   - tours: full list, lightweight
 *   - reviews: full list, each tagged with the tour it was for
 */
organizersRouter.get("/:slug", async (req, res) => {
  const org = await prisma.organizer.findUnique({
    where: { slug: req.params.slug },
  });
  if (!org) {
    res.status(404).json({ error: "operator not found" });
    return;
  }

  const tours = await prisma.tour.findMany({
    // Same hide-incomplete rule as /api/tours — only show fully-imaged tours.
    // Also hide pending/disabled/rejected so the public profile reflects the
    // catalog 1:1 (a tour the admin rejected shouldn't be reachable here).
    where: { organizerId: org.id, imageCount: { gt: 0 }, status: "active" },
    orderBy: { popularity: "desc" },
  });
  const tourIds = tours.map((t) => t.id);

  // Per-tour live rating from real reviews
  const perTourAgg = tourIds.length > 0
    ? await prisma.review.groupBy({
        by: ["tourId"],
        where: { tourId: { in: tourIds } },
        _count: { id: true },
        _avg: { rating: true },
      })
    : [];
  const tourRatingById = new Map<number, { rating: number; reviews: number }>();
  for (const r of perTourAgg) {
    tourRatingById.set(r.tourId, {
      rating: r._count.id > 0 ? Math.round((r._avg.rating ?? 0) * 10) / 10 : 0,
      reviews: r._count.id,
    });
  }

  // Aggregate rating across all reviews on this operator's tours
  const reviewAgg = await prisma.review.aggregate({
    where: { tourId: { in: tourIds } },
    _count: { id: true },
    _avg: { rating: true },
  });
  const completedBookings = await prisma.booking.count({
    where: { tourId: { in: tourIds }, status: "completed" },
  });

  // All reviews of all their tours, newest first, with tour info
  const reviews = await prisma.review.findMany({
    where: { tourId: { in: tourIds } },
    include: { tour: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({
    slug: org.slug,
    name: org.name,
    type: org.type,
    bio: org.bio,
    email: org.email,
    phone: org.phone,
    whatsapp: org.whatsapp ?? null,
    yearsActive: org.yearsActive,
    rating:
      reviewAgg._count.id > 0
        ? Math.round((reviewAgg._avg.rating ?? 0) * 10) / 10
        : null,
    reviewsCount: reviewAgg._count.id,
    toursCount: tours.length,
    tripsRun: completedBookings,
    tours: tours.map((t) => {
      const live = tourRatingById.get(t.id) ?? { rating: 0, reviews: 0 };
      return {
        id: t.slug,
        country: t.country,
        city: t.city,
        title: t.title,
        themes: json.parse<string[]>(t.themes, []),
        durationNights: t.durationNights,
        hotelStars: t.hotelStars,
        meal: t.meal,
        price: t.price,
        oldPrice: t.oldPrice ?? undefined,
        rating: live.rating,
        reviews: live.reviews,
        // Strip manual "ai" — that badge is personalised and not meaningful here.
        badge: t.badge === "ai" ? undefined : (t.badge ?? undefined),
        emoji: t.emoji,
        gradient: t.gradient,
        imageCount: t.imageCount,
        popularity: t.popularity,
        shortDescription: t.shortDescription,
      };
    }),
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      photos: json.parse<string[]>(r.photos, []),
      createdAt: r.createdAt.toISOString(),
      user: { name: r.user.name },
      tour: {
        slug: r.tour.slug,
        country: r.tour.country,
        city: r.tour.city,
        title: r.tour.title,
      },
    })),
  });
});
