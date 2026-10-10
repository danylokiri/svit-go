import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";

export const savedRouter = Router();

savedRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await prisma.savedTour.findMany({
    where: { userId: req.userId! },
    include: { tour: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows.map((r) => r.tour.slug));
});

const toggleSchema = z.object({ tourSlug: z.string() });

savedRouter.post("/toggle", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = toggleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tour = await prisma.tour.findUnique({ where: { slug: parsed.data.tourSlug } });
  if (!tour) {
    res.status(404).json({ error: "tour not found" });
    return;
  }

  // Idempotent toggle: catch Prisma's P2002 (unique violation on concurrent
  // create) and P2025 (record-not-found on concurrent delete). Either way
  // we can recover by re-checking final state and reporting it honestly.
  const userId = req.userId!;
  const compoundKey = { userId_tourId: { userId, tourId: tour.id } };
  const existing = await prisma.savedTour.findUnique({ where: compoundKey });

  try {
    if (existing) {
      await prisma.savedTour.delete({ where: compoundKey });
      res.json({ saved: false });
    } else {
      await prisma.savedTour.create({ data: { userId, tourId: tour.id } });
      res.json({ saved: true });
    }
  } catch (e) {
    // Concurrent toggle from another tab — recover gracefully by reporting
    // the post-conflict state. Avoids spurious 500s when the user
    // double-clicks "save" or has two tabs open.
    const code = (e as { code?: string }).code;
    if (code === "P2002" || code === "P2025") {
      const after = await prisma.savedTour.findUnique({ where: compoundKey });
      res.json({ saved: !!after });
      return;
    }
    throw e;
  }
});
