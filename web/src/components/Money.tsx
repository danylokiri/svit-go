import { useCurrency, convertFromEUR } from "@/contexts/CurrencyContext";

interface Props {
  /** Always EUR — the base price coming from the API. */
  eur: number;
  /** Override the display currency for this one render (e.g. a saved booking). */
  forceCurrency?: import("@/api").CurrencyCode;
  /** Pre-converted value to show as-is (e.g. snapshotted booking total). */
  forceAmount?: number;
  className?: string;
  /** When true, prefix with a tilde to signal "approximate FX conversion". */
  approximate?: boolean;
}

/**
 * Renders a price in the user's selected currency.
 *
 * Catalog prices are stored in EUR (base). When the user has chosen e.g. UAH
 * we multiply by the live rate and round to a whole number — currencies that
 * use sub-units (cents/kopecks) are rounded for display brevity.
 *
 * For saved bookings, pass forceAmount + forceCurrency so we render exactly
 * what the user paid (no rate drift).
 */
export function Money({ eur, forceCurrency, forceAmount, className, approximate }: Props) {
  const { currency: active, rates, symbols } = useCurrency();
  const code = forceCurrency ?? active;
  const value = forceAmount ?? convertFromEUR(eur, rates, code);
  const symbol = symbols[code];

  const formatted = formatNumber(value);
  const prefix = approximate ? "~" : "";

  // Symbol placement: € $ £ ₴ ₺ go BEFORE; "zł" "Kč" "₣" go AFTER (locale norm).
  const isSuffix = symbol === "zł" || symbol === "Kč" || symbol === "₣";

  return (
    <span className={className}>
      {prefix}
      {isSuffix ? `${formatted} ${symbol}` : `${symbol}${formatted}`}
    </span>
  );
}

function formatNumber(n: number): string {
  // Thin-space thousand separator works well visually for both UA and EN.
  return Math.round(n).toLocaleString("uk-UA").replace(/ /g, " ");
}
