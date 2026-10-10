import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchCurrencyRates, type CurrencyCode, type CurrencyRatesResponse } from "@/api";

const STORAGE_KEY = "svitgo.currency";

/**
 * Currency state, applied app-wide. The base price of every tour is EUR;
 * the active display currency is what we use to render prices via the Money
 * component. On every change the choice is persisted to localStorage so the
 * next visit honours the user's preference.
 */
interface CurrencyState {
  /** Selected display currency */
  currency: CurrencyCode;
  /** Set a new currency. Persisted. */
  setCurrency: (c: CurrencyCode) => void;
  /** EUR → currency rates. Defaults to fallback if fetch is pending. */
  rates: Record<CurrencyCode, number>;
  /** Symbol/code map for UI rendering */
  symbols: Record<CurrencyCode, string>;
  /** Full list of supported codes */
  supported: CurrencyCode[];
  /** Whether the live rates have been fetched yet */
  ready: boolean;
}

const Ctx = createContext<CurrencyState | null>(null);

// Hand-coded baseline rates (≈ early-2026 snapshot). These are shown only
// for the first ~200ms before the live frankfurter.app fetch resolves, so
// they don't need to be exact — but stale 2024 numbers (UAH 45, TRY 35.5)
// gave the wrong first impression to UA reviewers. UAH is ECB-unsupported
// so even live fetches fall back to this constant for UAH.
const FALLBACK_RATES: Record<CurrencyCode, number> = {
  EUR: 1,
  USD: 1.09,
  UAH: 50.0,
  PLN: 4.25,
  GBP: 0.85,
  CZK: 24.6,
  CHF: 0.96,
  TRY: 45.0,
};

const FALLBACK_SYMBOLS: Record<CurrencyCode, string> = {
  EUR: "€",
  USD: "$",
  UAH: "₴",
  PLN: "zł",
  GBP: "£",
  CZK: "Kč",
  CHF: "₣",
  TRY: "₺",
};

function getInitialCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "EUR";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (stored in FALLBACK_RATES)) return stored as CurrencyCode;
  // Best-effort default by browser locale: UAH for uk-*, USD for en-US, EUR for the rest
  const lang = navigator.language?.toLowerCase() ?? "";
  if (lang.startsWith("uk")) return "UAH";
  if (lang === "en-us") return "USD";
  if (lang.startsWith("pl")) return "PLN";
  return "EUR";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(getInitialCurrency);
  const [data, setData] = useState<CurrencyRatesResponse | null>(null);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCurrencyState(c);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, c);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCurrencyRates()
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<CurrencyState>(
    () => ({
      currency,
      setCurrency,
      // Merge live rates ON TOP of fallback. ECB-based feeds (frankfurter)
      // don't publish UAH, so without the merge picking UAH would yield
      // rate=undefined → convertFromEUR ×1 → prices stay in EUR-numbers
      // under a ₴ symbol. Always layer fallback first.
      rates: data?.rates ? { ...FALLBACK_RATES, ...data.rates } : FALLBACK_RATES,
      symbols: data?.symbols ?? FALLBACK_SYMBOLS,
      supported: data?.supported ?? (Object.keys(FALLBACK_RATES) as CurrencyCode[]),
      ready: !!data,
    }),
    [currency, setCurrency, data],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCurrency must be used inside <CurrencyProvider>");
  return ctx;
}

/** Convert an EUR base amount → the active currency, rounded to integer. */
export function convertFromEUR(amountEUR: number, rates: Record<CurrencyCode, number>, target: CurrencyCode): number {
  if (target === "EUR") return Math.round(amountEUR);
  return Math.round(amountEUR * (rates[target] ?? 1));
}
