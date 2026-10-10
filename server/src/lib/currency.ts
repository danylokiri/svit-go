/**
 * Currency rate service.
 *
 * Tours are priced in EUR (base) on the catalog. When a user picks a
 * different display currency, we convert client-side using rates fetched
 * here. Source: https://frankfurter.app — free, no API key, daily-refreshed
 * ECB rates.
 *
 * Cache: rates live in-process for 24h. A miss simply re-fetches.
 * If frankfurter is down, we fall back to a hand-coded baseline so the
 * app keeps rendering (slightly stale but never broken).
 */

export const SUPPORTED_CURRENCIES = [
  "EUR", "USD", "UAH", "PLN", "GBP", "CZK", "CHF", "TRY",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** Symbols used by the frontend Money component */
export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  EUR: "€",
  USD: "$",
  UAH: "₴",
  PLN: "zł",
  GBP: "£",
  CZK: "Kč",
  CHF: "₣",
  TRY: "₺",
};

/**
 * Baseline rates (≈ ECB May 2026 snapshot). Used until the first live fetch
 * succeeds, and as a fallback if frankfurter.app is unreachable.
 * Values express "1 EUR = X <currency>". EUR is 1 by definition.
 */
// Hand-coded baseline ≈ early-2026 ECB snapshot. UAH is permanent fallback
// (frankfurter doesn't publish ECB's UAH rate) — keep it close to reality.
// TRY drifts fast; if a UA reviewer sees a wildly wrong number they assume
// the whole product is unmaintained.
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

let cachedRates: Record<CurrencyCode, number> = { ...FALLBACK_RATES };
let cachedAt = 0;
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchLiveRates(): Promise<Record<CurrencyCode, number> | null> {
  try {
    // frankfurter accepts only a comma list of `to` currencies; EUR is base.
    const others = SUPPORTED_CURRENCIES.filter((c) => c !== "EUR").join(",");
    const url = `https://api.frankfurter.app/latest?from=EUR&to=${others}`;
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const data = (await r.json()) as FrankfurterResponse;
    const out: Record<string, number> = { EUR: 1 };
    for (const c of SUPPORTED_CURRENCIES) {
      if (c === "EUR") continue;
      const v = data.rates[c];
      if (typeof v === "number" && v > 0) out[c] = v;
    }
    return out as Record<CurrencyCode, number>;
  } catch (e) {
    console.warn("[currency] live fetch failed, using fallback:", (e as Error).message);
    return null;
  }
}

/** Get cached rates, refreshing in background if older than TTL. */
export async function getRates(): Promise<Record<CurrencyCode, number>> {
  const age = Date.now() - cachedAt;
  if (age < TTL_MS) return cachedRates;
  const live = await fetchLiveRates();
  if (live) {
    // IMPORTANT: frankfurter (ECB-based) doesn't publish certain currencies —
    // most notably UAH. Without this merge, picking UAH in the UI would set
    // the rate to `undefined` and convertFromEUR would silently fall back to
    // ×1, so all prices would stay in EUR-numbers under a ₴ symbol (the
    // very bug the user reported). Layer live ON TOP of fallback so missing
    // codes keep their hand-coded baseline.
    cachedRates = { ...FALLBACK_RATES, ...live };
    cachedAt = Date.now();
  } else if (cachedAt === 0) {
    cachedAt = Date.now() - TTL_MS + 60_000; // retry in 1 min
  }
  return cachedRates;
}

export function isSupportedCurrency(c: string): c is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

/** Convert EUR amount → target currency using current rates. Integer round. */
export function convertFromEUR(amountEUR: number, target: CurrencyCode, rates: Record<CurrencyCode, number>): number {
  if (target === "EUR") return Math.round(amountEUR);
  return Math.round(amountEUR * (rates[target] ?? 1));
}
