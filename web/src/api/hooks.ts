/**
 * SWR-based React hooks that wrap the imperative `fetchX` API helpers.
 *
 * Why both forms exist:
 *   - imperative `fetchX()` is fine for one-shot calls (form submit, etc.)
 *   - hooks add caching across components: if CatalogPage, HomePage and
 *     TourCard all need the same /api/tours response, they share ONE
 *     network request and the same response gets re-used during the next
 *     5 minutes if the user navigates back.
 *
 * SWR config in `main.tsx` sets the dedupingInterval globally. Per-hook
 * we tune `revalidateOnFocus` etc.
 */
import useSWR from "swr";
import {
  fetchAnalyticsSummary,
  fetchBookings,
  fetchMapData,
  fetchSaved,
  fetchTour,
  fetchTours,
  type AnalyticsSummary,
  type Booking,
  type MapData,
  type Tour,
  type ToursQuery,
} from "./index";

/**
 * Build a stable cache key. SWR keys are reference-checked so we have to
 * serialise the query object to ensure two equivalent queries dedupe.
 */
function key(prefix: string, params?: Record<string, unknown>) {
  if (!params) return prefix;
  // sort keys → "themes=water&country=Greece" === "country=Greece&themes=water"
  const norm = Object.keys(params)
    .sort()
    .filter((k) => params[k] != null)
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
  return `${prefix}?${norm}`;
}

/** Catalog / popular / etc. — large response, benefits a lot from cache.
 *  Returns the full {items, total} envelope so consumers that need to
 *  know "are we at the end of the list?" can read `total` directly. */
export function useTours(query: ToursQuery = {}) {
  return useSWR(key("tours", query as Record<string, unknown>), () => fetchTours(query), {
    // Tour list rarely changes mid-browsing — keep the response fresh
    // for 60s after the first fetch (configured globally in main.tsx too).
    revalidateOnFocus: false,
  });
}

/** One tour by slug. Many components on TourPage rely on the same fetch. */
export function useTour(slug: string | undefined) {
  return useSWR<Tour>(slug ? `tour:${slug}` : null, () => fetchTour(slug!), {
    revalidateOnFocus: false,
  });
}

/** World-map metadata. Practically static (changes only when catalog
 *  changes); ok to cache aggressively. */
export function useMapData() {
  return useSWR<MapData>("map-data", fetchMapData, {
    revalidateOnFocus: false,
    revalidateIfStale: false,    // once loaded, don't auto-refresh
  });
}

/** My bookings. Personal, change-prone — revalidate on focus so a new
 *  booking from another tab shows up. */
export function useBookings(enabled = true) {
  return useSWR<Booking[]>(enabled ? "bookings" : null, fetchBookings);
}

/** Slugs of tours the user has saved. */
export function useSaved(enabled = true) {
  return useSWR<string[]>(enabled ? "saved" : null, fetchSaved);
}

/** Public analytics — totally static across requests, perfect for cache. */
export function useAnalyticsSummary() {
  return useSWR<AnalyticsSummary>("analytics-summary", fetchAnalyticsSummary, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });
}
