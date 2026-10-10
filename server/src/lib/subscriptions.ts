/**
 * Subscription tier helpers — shared definitions of what each tier costs
 * and grants. Imported by:
 *   - routes/subscriptions.ts (start/cancel)
 *   - lib/ai-rate-limit (raises ceiling for paid tiers)
 *   - routes/tours.ts (Pro-exclusive tours, early access window)
 *
 * Free is implicit (no DB row). Plus / Pro persist via the Subscription
 * model.
 */
import { prisma } from "../db.js";

export type SubscriptionTier = "free" | "plus" | "pro";

export interface TierFeatures {
  /** Daily AI chat budget — null = unlimited */
  aiDailyLimit: number | null;
  /** Hours of early access to publishedAt-gated tours */
  earlyAccessHours: number;
  /** Free cancellation window (h) */
  cancelWindowHours: number;
  /** Whether the AI multi-city concierge route is enabled */
  conciergeEnabled: boolean;
  /** Display label for UI */
  label: string;
  /** Monthly price in EUR (0 for free) */
  monthlyPriceEUR: number;
}

export const TIERS: Record<SubscriptionTier, TierFeatures> = {
  free: {
    aiDailyLimit: 20,
    earlyAccessHours: 0,
    cancelWindowHours: 0,
    conciergeEnabled: false,
    label: "Free",
    monthlyPriceEUR: 0,
  },
  plus: {
    aiDailyLimit: 100,
    earlyAccessHours: 48,
    cancelWindowHours: 0,
    conciergeEnabled: false,
    label: "Plus",
    monthlyPriceEUR: 4.99,
  },
  pro: {
    aiDailyLimit: null,
    earlyAccessHours: 168, // 7 days
    cancelWindowHours: 24,
    conciergeEnabled: true,
    label: "Pro",
    monthlyPriceEUR: 14.99,
  },
};

/** Resolves a user's currently-active tier (defaults to "free"). */
export async function getUserTier(userId: number | undefined): Promise<SubscriptionTier> {
  if (!userId) return "free";
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return "free";
  // Cancelled subs still grant access until renewsAt passes.
  if (sub.renewsAt < new Date()) return "free";
  if (sub.tier === "plus" || sub.tier === "pro") return sub.tier;
  return "free";
}
