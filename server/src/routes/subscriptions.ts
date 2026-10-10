import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";
import { TIERS, type SubscriptionTier, getUserTier } from "../lib/subscriptions.js";

export const subscriptionsRouter = Router();

/**
 * GET /api/subscriptions/me
 *
 * Returns the caller's current tier + the public tier catalogue. Available
 * anonymously (returns tier=free) so the /pricing page can render without
 * forcing login first.
 */
subscriptionsRouter.get("/me", async (req: AuthedRequest, res) => {
  const tier = await getUserTier(req.userId);
  let renewsAt: string | null = null;
  let cancelledAt: string | null = null;
  if (req.userId && tier !== "free") {
    const sub = await prisma.subscription.findUnique({ where: { userId: req.userId } });
    if (sub) {
      renewsAt = sub.renewsAt.toISOString();
      cancelledAt = sub.cancelledAt?.toISOString() ?? null;
    }
  }
  res.json({
    tier,
    renewsAt,
    cancelledAt,
    tiers: TIERS,
  });
});

const startSchema = z.object({
  tier: z.enum(["plus", "pro"]),
});

/**
 * POST /api/subscriptions/start
 *
 * Demo: instantly upgrades the user. Real-world: should redirect to a
 * Stripe checkout session; the webhook would call this with stripeId set.
 */
subscriptionsRouter.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tier: SubscriptionTier = parsed.data.tier;

  // Resubscribe-after-cancel must NOT wipe the user's remaining paid days.
  // If they cancelled mid-cycle and changed their mind a week later, their
  // existing renewsAt is still in the future — keep it. Only push forward
  // to today+1mo when re-activating an already-expired sub (audit-final F10).
  const existing = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
  const now = new Date();
  const freshRenewsAt = new Date();
  freshRenewsAt.setMonth(freshRenewsAt.getMonth() + 1);
  const renewsAt = existing && existing.renewsAt > now && existing.tier === tier
    ? existing.renewsAt   // preserve remaining time on same tier
    : freshRenewsAt;

  const sub = await prisma.subscription.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, tier, renewsAt },
    update: { tier, renewsAt, cancelledAt: null },
  });
  res.json({
    tier: sub.tier,
    renewsAt: sub.renewsAt.toISOString(),
    cancelledAt: null,
  });
});

/**
 * POST /api/subscriptions/cancel
 *
 * Marks the subscription as cancelled but keeps access until renewsAt.
 */
subscriptionsRouter.post("/cancel", requireAuth, async (req: AuthedRequest, res) => {
  const sub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
  if (!sub) {
    res.status(404).json({ error: "no active subscription" });
    return;
  }
  const updated = await prisma.subscription.update({
    where: { userId: req.userId! },
    data: { cancelledAt: new Date() },
  });
  res.json({
    tier: updated.tier,
    renewsAt: updated.renewsAt.toISOString(),
    cancelledAt: updated.cancelledAt?.toISOString() ?? null,
  });
});
