import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(value: number, currency = "€") {
  return `${currency}${value.toLocaleString("en-US").replace(/,/g, " ")}`;
}

/**
 * Locale-aware date formatting. Use this everywhere instead of inline
 * `toLocaleDateString("en-US"|"en-GB", ...)` — those were hardcoding the
 * format regardless of the user's active locale (audit-final F7).
 *
 *   formatDate(d, "uk", { month: "short" }) → "трав 2026"
 *   formatDate(d, "en", { month: "short" }) → "May 2026"
 *
 * Pass a Date | string (ISO). Empty/invalid input → empty string.
 */
export function formatDate(
  input: Date | string | null | undefined,
  locale: "en" | "uk" = "en",
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US", options);
}

/** Path to the hero image of a tour, or null if no images are uploaded yet.
 *
 *  Returns the JPG path — historically the only format. Modern callers
 *  should prefer `tourHeroSrcSet()` which yields the responsive WebP set;
 *  this single-URL form is kept for `<img alt="" src={...}>` fallbacks. */
export function tourHero(slug: string, imageCount: number): string | null {
  return imageCount > 0 ? `/tours/${slug}/hero.jpg` : null;
}

/**
 * Build a responsive `srcSet` + matching `sizes` attribute for the tour
 * hero image. The optimisation script produces three WebP variants
 * (`hero.w400.webp`, `hero.w800.webp`, `hero.webp` at 1920w); the
 * browser picks the smallest one that fits its display.
 *
 * Pass the size context with `sizes` — e.g. "(max-width:640px) 100vw, 50vw"
 * for a 2-column card grid, "100vw" for a full-bleed hero.
 */
export function tourHeroSrcSet(slug: string, imageCount: number): {
  webp: string;
  jpgFallback: string;
} | null {
  if (imageCount <= 0) return null;
  const base = `/tours/${slug}`;
  return {
    webp: `${base}/hero.w400.webp 400w, ${base}/hero.w800.webp 800w, ${base}/hero.webp 1920w`,
    jpgFallback: `${base}/hero.jpg`,
  };
}

/** Paths to all gallery images for a tour (excluding hero), .webp form. */
export function tourGallery(slug: string, imageCount: number): string[] {
  const out: string[] = [];
  // gallery-1 .. gallery-N (imageCount includes hero)
  for (let i = 1; i < imageCount; i++) {
    out.push(`/tours/${slug}/gallery-${i}.webp`);
  }
  return out;
}
