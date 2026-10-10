import { Router } from "express";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";

export const reviewsRouter = Router();

const createSchema = z.object({
  bookingId: z.number().int(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  photos: z.array(z.string().url().or(z.string().regex(/^\//))).optional().default([]),
});

// GET /api/tours/:slug/reviews  → list reviews for a tour (public)
reviewsRouter.get("/tour/:slug", async (req, res) => {
  const tour = await prisma.tour.findUnique({ where: { slug: req.params.slug } });
  if (!tour) {
    res.status(404).json({ error: "tour not found" });
    return;
  }
  const rows = await prisma.review.findMany({
    where: { tourId: tour.id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    photos: json.parse<string[]>(r.photos, []),
    createdAt: r.createdAt.toISOString(),
    user: { name: r.user.name },
  })));
});

// POST /api/reviews  → create a review for a completed booking (auth)
reviewsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { bookingId, rating, title, body, photos } = parsed.data;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { review: true },
  });
  if (!booking || booking.userId !== req.userId) {
    res.status(404).json({ error: "booking not found" });
    return;
  }
  if (booking.review) {
    res.status(409).json({ error: "review already exists for this booking" });
    return;
  }
  // Optional: enforce that booking is in the past
  if (booking.startDate && booking.startDate > new Date()) {
    res.status(400).json({ error: "you can only review past trips" });
    return;
  }

  const review = await prisma.review.create({
    data: {
      userId: req.userId!,
      tourId: booking.tourId,
      bookingId: booking.id,
      rating,
      title,
      body,
      photos: JSON.stringify(photos),
    },
  });
  res.status(201).json({
    id: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    photos: json.parse<string[]>(review.photos, []),
    createdAt: review.createdAt.toISOString(),
  });
});
