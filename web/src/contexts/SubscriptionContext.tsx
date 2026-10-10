import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  cancelSubscription as apiCancel,
  fetchSubscription,
  startSubscription as apiStart,
  type SubscriptionState as ApiSubState,
  type SubscriptionTier,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";

interface SubscriptionContextValue extends ApiSubState {
  loading: boolean;
  /** Upgrade to a paid tier (no Stripe yet — demo instantly activates). */
  start: (tier: Exclude<SubscriptionTier, "free">) => Promise<void>;
  /** Mark current subscription as cancelled (keeps access until renewsAt). */
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SubscriptionContextValue | null>(null);

/**
 * Single source of truth for "what tier is the user on right now".
 *
 * Anonymous + Free → tier = "free". Plus/Pro come from the Subscription row.
 * Cancellations still grant access until renewsAt (so a user who cancels
 * mid-cycle doesn't lose what they paid for).
 */
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ApiSubState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchSubscription();
      setState(s);
    } catch {
      setState(null);
    }
  }, []);

  // Re-fetch on auth change so a fresh login picks up its tier immediately.
  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [user, refresh]);

  const start = useCallback(async (tier: Exclude<SubscriptionTier, "free">) => {
    await apiStart(tier);
    await refresh();
  }, [refresh]);

  const cancel = useCallback(async () => {
    await apiCancel();
    await refresh();
  }, [refresh]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      tier: state?.tier ?? "free",
      renewsAt: state?.renewsAt ?? null,
      cancelledAt: state?.cancelledAt ?? null,
      tiers: state?.tiers ?? {
        // Fallback tier definitions until /me responds. Match server defaults.
        free: { aiDailyLimit: 20, earlyAccessHours: 0, cancelWindowHours: 0, conciergeEnabled: false, label: "Free", monthlyPriceEUR: 0 },
        plus: { aiDailyLimit: 100, earlyAccessHours: 48, cancelWindowHours: 0, conciergeEnabled: false, label: "Plus", monthlyPriceEUR: 4.99 },
        pro:  { aiDailyLimit: null, earlyAccessHours: 168, cancelWindowHours: 24, conciergeEnabled: true, label: "Pro", monthlyPriceEUR: 14.99 },
      },
      loading,
      start,
      cancel,
      refresh,
    }),
    [state, loading, start, cancel, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSubscription must be used inside <SubscriptionProvider>");
  return ctx;
}
