import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import GlassCard from "@/components/GlassCard";
import { Money } from "@/components/Money";
import FakePaymentModal from "@/components/FakePaymentModal";
import { useAuth } from "@/auth/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Dict } from "@/lib/i18n";
import type { SubscriptionTier, TierFeatures } from "@/api";

/**
 * Public pricing page. Three plans side-by-side, current tier highlighted,
 * CTA wired to the SubscriptionContext (which talks to the demo backend —
 * no Stripe here yet).
 */
export default function PricingPage() {
  const { user } = useAuth();
  const sub = useSubscription();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<null | "starting" | "cancelling">(null);
  const [toast, setToast] = useState(false);
  /** Which tier the user is paying for right now (modal open). */
  const [paying, setPaying] = useState<null | "plus" | "pro">(null);

  const tierOrder: SubscriptionTier[] = ["free", "plus", "pro"];
  const tiers = sub.tiers;

  function handleSubscribe(target: Exclude<SubscriptionTier, "free">) {
    // Don't flip the tier yet — open the payment modal first. The modal
    // calls back into the actual start() once the simulated card form
    // "succeeds", so the user sees a payment step instead of an instant flip.
    setPaying(target);
  }

  async function completePayment() {
    if (!paying) return;
    setBusy("starting");
    try {
      await sub.start(paying);
      flashToast();
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    const ok = await confirm({
      title: t("pricing.confirmCancel.title"),
      body: t("pricing.confirmCancel.body"),
      confirmLabel: t("pricing.confirmCancel.confirm"),
      cancelLabel: t("pricing.confirmCancel.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy("cancelling");
    try {
      await sub.cancel();
      flashToast();
    } finally {
      setBusy(null);
    }
  }

  function flashToast() {
    setToast(true);
    // Auto-dismiss after the user has had time to read it.
    window.setTimeout(() => setToast(false), 2500);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-20 pb-16">
      <header className="text-center">
        <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">{t("pricing.title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-secondary md:text-base">
          {t("pricing.subtitle")}
        </p>
      </header>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {tierOrder.map((tier) => (
          <PlanCard
            key={tier}
            tier={tier}
            features={tiers[tier]}
            currentTier={sub.tier}
            anonymous={!user}
            cancelledAt={sub.cancelledAt}
            renewsAt={sub.renewsAt}
            busy={busy}
            onSubscribe={() => tier !== "free" && handleSubscribe(tier)}
            onCancel={handleCancel}
          />
        ))}
      </div>

      {toast && (
        <div className="glass-strong fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-pill px-6 py-3 text-sm shadow-glass-lg">
          {t("pricing.toastUpdated")}
        </div>
      )}

      <FakePaymentModal
        open={paying != null}
        tier={paying ?? "plus"}
        priceEUR={paying ? tiers[paying].monthlyPriceEUR : 0}
        onClose={() => setPaying(null)}
        onSuccess={completePayment}
      />
    </div>
  );
}

function PlanCard({
  tier,
  features,
  currentTier,
  anonymous,
  cancelledAt,
  renewsAt,
  busy,
  onSubscribe,
  onCancel,
}: {
  tier: SubscriptionTier;
  features: TierFeatures;
  currentTier: SubscriptionTier;
  anonymous: boolean;
  cancelledAt: string | null;
  renewsAt: string | null;
  busy: null | "starting" | "cancelling";
  onSubscribe: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const isCurrent = currentTier === tier;
  const isPro = tier === "pro";

  // Tier rank: higher number = stronger plan. Used to know whether the CTA
  // is an upgrade, a sidegrade or nothing-to-do.
  const rank: Record<SubscriptionTier, number> = { free: 0, plus: 1, pro: 2 };
  const isUpgradeFromCurrent = rank[tier] > rank[currentTier];

  const benefits = useMemo(() => buildBenefits(features, t), [features, t]);

  // Render the highlighted Pro card with a gradient ring — calls attention
  // without resorting to a separate component or layout shift.
  return (
    <GlassCard
      variant={isPro ? "strong" : "default"}
      className={cn(
        "relative flex flex-col p-6",
        isPro && "ring-2 ring-blue-primary/40",
      )}
    >
      {isPro && (
        <span className="absolute -top-3 right-6 chip bg-gradient-to-r from-blue-primary to-orange-accent text-white">
          {t("pricing.bestValue")}
        </span>
      )}

      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-extrabold">{tierLabel(tier, t)}</h2>
        {isCurrent && <span className="chip chip-cream text-xs">{t("pricing.current")}</span>}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        {tier === "free" ? (
          <span className="text-4xl font-extrabold">{t("pricing.free")}</span>
        ) : (
          <>
            <span className="text-4xl font-extrabold">
              <Money eur={features.monthlyPriceEUR} />
            </span>
            <span className="text-sm text-ink-secondary">{t("pricing.monthly")}</span>
          </>
        )}
      </div>

      <ul className="mt-5 flex-1 space-y-2 text-sm">
        {benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-deep">✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {/* Show renewal / cancellation status under the current tier */}
      {isCurrent && tier !== "free" && (
        <div className="mt-4 text-xs text-ink-secondary">
          {cancelledAt
            ? t("subscription.cancelledUntil", { date: formatDate(renewsAt) })
            : t("subscription.renewsAt", { date: formatDate(renewsAt) })}
        </div>
      )}

      <PlanCTA
        tier={tier}
        isCurrent={isCurrent}
        isUpgrade={isUpgradeFromCurrent}
        anonymous={anonymous}
        cancelled={!!cancelledAt}
        busy={busy}
        onSubscribe={onSubscribe}
        onCancel={onCancel}
      />
    </GlassCard>
  );
}

function PlanCTA({
  tier,
  isCurrent,
  isUpgrade,
  anonymous,
  cancelled,
  busy,
  onSubscribe,
  onCancel,
}: {
  tier: SubscriptionTier;
  isCurrent: boolean;
  isUpgrade: boolean;
  anonymous: boolean;
  cancelled: boolean;
  busy: null | "starting" | "cancelling";
  onSubscribe: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();

  // Anonymous: every paid plan funnels through /auth?next=/pricing so the
  // user lands back on this page after signing in.
  if (anonymous) {
    if (tier === "free") {
      return (
        <button disabled className="btn mt-5 w-full justify-center bg-white/40 text-ink-secondary">
          {t("pricing.current")}
        </button>
      );
    }
    return (
      <Link to="/auth?next=/pricing" className="btn btn-primary mt-5 w-full justify-center">
        {t("pricing.signInCta")}
      </Link>
    );
  }

  // Logged-in flow.
  if (tier === "free") {
    return (
      <button disabled={isCurrent} className="btn mt-5 w-full justify-center bg-white/40 text-ink-secondary disabled:cursor-not-allowed">
        {isCurrent ? t("pricing.current") : tierLabel(tier, t)}
      </button>
    );
  }

  if (isCurrent) {
    // Current paid tier — show Cancel (or Resubscribe if already cancelled).
    if (cancelled) {
      return (
        <button
          onClick={onSubscribe}
          disabled={busy === "starting"}
          className="btn btn-primary mt-5 w-full justify-center disabled:opacity-60"
        >
          {busy === "starting" ? t("pricing.starting") : t("subscription.resubscribe")}
        </button>
      );
    }
    return (
      <button
        onClick={onCancel}
        disabled={busy === "cancelling"}
        className="btn btn-ghost mt-5 w-full justify-center disabled:opacity-60"
      >
        {busy === "cancelling" ? t("pricing.cancelling") : t("pricing.cancelCta")}
      </button>
    );
  }

  // Not the current tier — Subscribe / Upgrade.
  return (
    <button
      onClick={onSubscribe}
      disabled={busy === "starting"}
      className="btn btn-primary mt-5 w-full justify-center disabled:opacity-60"
    >
      {busy === "starting"
        ? t("pricing.starting")
        : isUpgrade
          ? t("pricing.upgrade")
          : t("pricing.subscribe")}
    </button>
  );
}

// ---------------------------------------------------------------------------
//  Small pure helpers
// ---------------------------------------------------------------------------

function buildBenefits(f: TierFeatures, t: (k: keyof Dict, vars?: Record<string, string | number>) => string): string[] {
  const out: string[] = [];
  if (f.aiDailyLimit === null) out.push(t("pricing.benefit.aiUnlimited"));
  else out.push(t("pricing.benefit.aiLimit", { n: f.aiDailyLimit }));

  if (f.earlyAccessHours > 0) out.push(t("pricing.benefit.earlyAccess", { n: f.earlyAccessHours }));
  if (f.cancelWindowHours > 0) out.push(t("pricing.benefit.cancelWindow", { n: f.cancelWindowHours }));
  if (f.conciergeEnabled) out.push(t("pricing.benefit.concierge"));
  return out;
}

function tierLabel(tier: SubscriptionTier, t: (k: keyof Dict, vars?: Record<string, string | number>) => string): string {
  if (tier === "free") return t("subscription.tier.free");
  if (tier === "plus") return t("subscription.tier.plus");
  return t("subscription.tier.pro");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
