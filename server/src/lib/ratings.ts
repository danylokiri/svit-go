/**
 * Shared "live rating" computation used by every endpoint that returns Tour
 * data — so a tour's star count is the same everywhere on the site.
 *
 * Returns 0/0 when there are no real reviews — UI hides the chip in that case.
 */
import { prisma } from "../db.js";

export interface LiveRating {
  rating: number;
  reviews: number;
}

/** Compute for a single tour. */
export async function computeRating(tourId: number): Promise<LiveRating> {
  const agg = await prisma.review.aggregate({
    where: { tourId },
    _count: { id: true },
    _avg: { rating: true },
  });
  return {
    rating: agg._count.id > 0 ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : 0,
    reviews: agg._count.id,
  };
}

/** Batch version — one DB call for N tour ids. Use when rendering lists. */
export async function computeRatingsBatch(tourIds: number[]): Promise<Map<number, LiveRating>> {
  if (tourIds.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["tourId"],
    where: { tourId: { in: tourIds } },
    _count: { id: true },
    _avg: { rating: true },
  });
  const out = new Map<number, LiveRating>();
  for (const id of tourIds) out.set(id, { rating: 0, reviews: 0 }); // default
  for (const r of rows) {
    out.set(r.tourId, {
      rating: r._count.id > 0 ? Math.round((r._avg.rating ?? 0) * 10) / 10 : 0,
      reviews: r._count.id,
    });
  }
  return out;
}
