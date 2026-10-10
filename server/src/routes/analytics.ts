/**
 * Public analytics summary — feeds the homepage "trending now" strip and
 * gives the diploma report real numbers ("X bookings, Y AI queries this
 * month") instead of made-up figures.
 *
 * Everything here is computed live from AiQuery / Booking / Review rows.
 * No write side effects.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { computePopularityBatch } from "../lib/popularity.js";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", async (_req, res) => {
  // 30-day window — recent enough to be relevant, long enough that a quiet
  // day doesn't make everything look dead.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalBookings,
    totalReviews,
    totalAiQueries,
    recentBookings,
    recentReviews,
    recentAiQueries,
    activeTours,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.review.count(),
    prisma.aiQuery.count(),
    prisma.booking.count({ where: { createdAt: { gte: since } } }),
    prisma.review.count({  where: { createdAt: { gte: since } } }),
    prisma.aiQuery.count({ where: { createdAt: { gte: since } } }),
    prisma.tour.count({ where: { imageCount: { gt: 0 } } }),
  ]);

  // Top 5 tours by live popularity score
  const allTours = await prisma.tour.findMany({
    where: { imageCount: { gt: 0 } },
    select: { id: true, slug: true, country: true, city: true, title: true },
  });
  const pop = await computePopularityBatch(allTours.map((t) => t.id));
  const top = allTours
    .map((t) => ({ tour: t, stats: pop.get(t.id)! }))
    .sort((a, b) => b.stats.score - a.stats.score)
    .slice(0, 5)
    .map(({ tour, stats }) => ({
      slug: tour.slug,
      country: tour.country,
      city: tour.city,
      title: tour.title,
      bookings: stats.bookings,
      reviews: stats.reviews,
      saves: stats.saves,
      aiMentions: stats.aiMentions,
      score: Math.round(stats.score * 10) / 10,
    }));

  res.json({
    totals: {
      tours: activeTours,
      bookings: totalBookings,
      reviews: totalReviews,
      aiQueries: totalAiQueries,
    },
    last30days: {
      bookings: recentBookings,
      reviews: recentReviews,
      aiQueries: recentAiQueries,
    },
    topTours: top,
  });
});
