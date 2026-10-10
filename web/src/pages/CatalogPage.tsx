import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import useSWRInfinite from "swr/infinite";
import GlassCard from "@/components/GlassCard";
import DepartureFilter from "@/components/DepartureFilter";
import TourCard from "@/components/TourCard";
import { TourGridSkeleton } from "@/components/Skeleton";
import { themes, type Theme } from "@/data/mockTours";
import { fetchTours, type Tour } from "@/api";
import { cn } from "@/lib/utils";
import { Money } from "@/components/Money";
import { softT, useI18n } from "@/lib/i18n";

/** How many tours to request per infinite-scroll page. 24 is a multiple
 *  of every common grid (1/2/3/4 cards per row) so each page fills the
 *  viewport cleanly across breakpoints. */
const PAGE_SIZE = 24;

const ALL_THEME_IDS = new Set(themes.map((t) => t.id));
function parseThemes(raw: string | null): Theme[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Theme => ALL_THEME_IDS.has(s as Theme));
}
function parseCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

type SortKey =
  | "popular"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "newest"
  | "discount"
  | "duration";

/** Sort option labels resolve through i18n — see useSortOptions(). */
const sortKeys: SortKey[] = ["popular", "price-asc", "price-desc", "rating", "newest", "discount", "duration"];

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();

  // Themes & countries can be pre-selected via URL (used by home-page tile
  // clicks and shareable filter links).
  const [activeThemes, setActiveThemes]   = useState<Theme[]>(() => parseThemes(searchParams.get("themes")));
  const [countries, setCountries]         = useState<string[]>(() => parseCsv(searchParams.get("countries")));
  // priceRange / nightsRange start as `null` and get filled from the
  // server's `bounds` response (min/max across the WHOLE catalog) as
  // soon as the first page arrives. Until that point the page shows
  // every loaded tour without filtering. This avoids two bugs we used
  // to have:
  //   1) Hard-coded defaults (400–3000) silently filtered out cheaper
  //      or pricier tours, so "13 of 24 loaded" looked broken.
  //   2) Slider track went 0 → 100 000 with all real tours bunched into
  //      the leftmost 5 % of the bar — impossible to drag precisely.
  // With bounds-driven defaults the slider snaps to the actual range
  // (e.g. €320 → €5 680 for the current seed) and "fully open" means
  // exactly that.
  const [priceRange, setPriceRange]       = useState<[number, number] | null>(null);
  const [nightsRange, setNightsRange]     = useState<[number, number] | null>(null);
  const [stars, setStars]                 = useState<number[]>([]);
  const [meals, setMeals]                 = useState<string[]>([]);
  const [onlyDiscount, setOnlyDiscount]   = useState(false);
  const [query, setQuery]                 = useState("");
  const [sort, setSort]                   = useState<SortKey>("popular");
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  // Date filter — empty string === unset. The server narrows by these via
  // `departFrom` / `departTo` query params (it inspects each tour's
  // departures array). We pass through to useTours so SWR keys differ
  // by the chosen range and the request is deduped per pair.
  const [departFrom, setDepartFrom]       = useState("");
  const [departTo, setDepartTo]           = useState("");

  // Keep ?themes=... in URL in sync with state so the page is shareable
  // and the back button works as expected.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (activeThemes.length > 0) next.set("themes", activeThemes.join(","));
    else next.delete("themes");
    if (countries.length > 0) next.set("countries", countries.join(","));
    else next.delete("countries");
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThemes, countries]);

  // Listen for URL changes (e.g. user navigated to /catalog?themes=water or
  // /catalog?countries=Greece from home/map while already on catalog).
  useEffect(() => {
    const urlThemes = parseThemes(searchParams.get("themes"));
    const sameThemes =
      urlThemes.length === activeThemes.length &&
      urlThemes.every((t) => activeThemes.includes(t));
    if (!sameThemes) setActiveThemes(urlThemes);

    const urlCountries = parseCsv(searchParams.get("countries"));
    const sameCountries =
      urlCountries.length === countries.length &&
      urlCountries.every((c) => countries.includes(c));
    if (!sameCountries) setCountries(urlCountries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Infinite-scroll pagination via `useSWRInfinite`. Each page is 24
  // tours; the SWR key encodes the page index and date-range so SWR
  // dedupes correctly when filters change. Filtering by theme / country
  // / price / etc. still happens client-side over whatever has been
  // loaded so far — when filters narrow the visible set, the IntersectionObserver
  // sentinel below pulls the next page automatically until the dataset
  // is exhausted, which keeps the UX continuous.
  const getKey = (pageIndex: number, prev: { items: Tour[]; total: number } | null) => {
    if (prev && prev.items.length < PAGE_SIZE) return null;     // last page reached
    return ["tours", pageIndex, departFrom || "", departTo || ""] as const;
  };
  const { data: pages, size, setSize, isLoading: loading, isValidating } = useSWRInfinite(
    getKey,
    async (key) => {
      const [, pageIndex, df, dt] = key;
      return fetchTours({
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
        departFrom: df || undefined,
        departTo: dt || undefined,
      });
    },
    { revalidateFirstPage: false },
  );

  // Flatten the array of pages into a single list — every consumer below
  // (filters, sorts, grid) treats it as one continuous catalog.
  const allTours = useMemo<Tour[]>(() => (pages ?? []).flatMap((p) => p.items), [pages]);
  const totalAvailable = pages?.[0]?.total ?? 0;
  // Bounds (real min/max across the entire catalog) arrive with the first
  // page. They drive the slider endpoints AND the implicit "no filter"
  // default — see the useEffect below.
  const bounds = pages?.[0]?.bounds;
  // We've reached the end when the last fetched page returned less than
  // PAGE_SIZE OR we've accumulated `total` rows.
  const lastPage = pages?.[pages.length - 1];
  const reachedEnd = !!lastPage && lastPage.items.length < PAGE_SIZE;
  const hasMore = !reachedEnd && allTours.length < totalAvailable;
  const loadingMore = isValidating && (pages?.length ?? 0) > 0;

  // Initialise sliders from the server bounds the first time they arrive.
  // We only set them when currently null so a user who manually picked a
  // range doesn't get it reset whenever the bounds re-fetch (e.g. after
  // refocus).
  useEffect(() => {
    if (!bounds) return;
    setPriceRange((prev) => prev ?? [bounds.priceMin, bounds.priceMax]);
    setNightsRange((prev) => prev ?? [bounds.nightsMin, bounds.nightsMax]);
  }, [bounds]);

  const allCountries = useMemo(
    () => Array.from(new Set(allTours.map((t) => t.country))).sort(),
    [allTours]
  );
  const allMeals = useMemo(
    () => Array.from(new Set(allTours.map((t) => t.meal))).sort(),
    [allTours]
  );

  const filtered = useMemo(() => {
    const list = allTours.filter((t) => {
      if (priceRange && (t.price < priceRange[0] || t.price > priceRange[1])) return false;
      if (nightsRange && (t.durationNights < nightsRange[0] || t.durationNights > nightsRange[1])) return false;
      if (stars.length && !stars.includes(t.hotelStars)) return false;
      if (countries.length && !countries.includes(t.country)) return false;
      if (meals.length && !meals.includes(t.meal)) return false;
      if (onlyDiscount && !t.oldPrice) return false;
      if (activeThemes.length && !t.themes.some((th) => activeThemes.includes(th))) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (
          !t.title.toLowerCase().includes(q) &&
          !t.city.toLowerCase().includes(q) &&
          !t.country.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (sort) {
        case "price-asc":  return a.price - b.price;
        case "price-desc": return b.price - a.price;
        case "rating":     return b.rating - a.rating;
        case "newest":     return b.createdAt.localeCompare(a.createdAt);
        case "discount": {
          const da = a.oldPrice ? 1 - a.price / a.oldPrice : 0;
          const db = b.oldPrice ? 1 - b.price / b.oldPrice : 0;
          return db - da;
        }
        case "duration":   return a.durationNights - b.durationNights;
        case "popular":
        default:           return b.popularity - a.popularity;
      }
    });

    return list;
  }, [allTours, activeThemes, priceRange, nightsRange, stars, countries, meals, onlyDiscount, query, sort]);

  // A range counts as "active" only when it's been narrowed from the
  // server bounds (i.e. user actively dragged the slider).
  const priceIsNarrowed =
    !!bounds && !!priceRange &&
    (priceRange[0] !== bounds.priceMin || priceRange[1] !== bounds.priceMax);
  const nightsIsNarrowed =
    !!bounds && !!nightsRange &&
    (nightsRange[0] !== bounds.nightsMin || nightsRange[1] !== bounds.nightsMax);
  const activeFiltersCount =
    activeThemes.length +
    stars.length +
    countries.length +
    meals.length +
    (onlyDiscount ? 1 : 0) +
    (priceIsNarrowed ? 1 : 0) +
    (nightsIsNarrowed ? 1 : 0);

  function resetAll() {
    setActiveThemes([]);
    setPriceRange(bounds ? [bounds.priceMin, bounds.priceMax] : null);
    setNightsRange(bounds ? [bounds.nightsMin, bounds.nightsMax] : null);
    setStars([]);
    setCountries([]);
    setMeals([]);
    setOnlyDiscount(false);
    setQuery("");
    setDepartFrom("");
    setDepartTo("");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-16">
      {/* ?missing=1 → user landed here after a 404 on a tour link.
          One-time toast, dismissed automatically. */}
      {searchParams.get("missing") === "1" && <MissingTourToast />}

      {/* Title + top bar */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-marker text-6xl leading-none md:text-7xl">{t("catalog.title")}</h1>
          <p className="mt-3 text-ink-secondary">
            {loading && allTours.length === 0
              ? t("catalog.loading")
              : activeFiltersCount > 0 || query.trim()
                // With filters active the "X of Y" framing is useful — it
                // tells the user how aggressively they've narrowed down.
                ? <>{t("catalog.found")} <b className="text-ink-primary">{filtered.length}</b> {t("catalog.of")} {totalAvailable} {t("catalog.destinations")}</>
                // No filters → show the true catalog size from the server
                // (`totalAvailable`) so the user knows how many tours exist
                // in the database, not just how many have loaded into the
                // infinite-scroll buffer so far.
                : <>{t("catalog.showingAll")} <b className="text-ink-primary">{totalAvailable}</b> {t("catalog.destinations")}</>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="search-pill flex items-center gap-2 rounded-pill bg-white/60 px-4 py-2.5 shadow-soft">
            <Search size={16} className="text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("catalog.searchPlaceholder")}
              className="w-56 bg-transparent text-sm outline-none placeholder:text-ink-muted"
            />
          </div>
          <SortMenu value={sort} onChange={setSort} />
          <button
            type="button"
            onClick={() => setShowFiltersMobile((s) => !s)}
            className="chip chip-cream lg:hidden"
          >
            <SlidersHorizontal size={14} />
            {t("catalog.filtersBtn")}{activeFiltersCount > 0 ? ` · ${activeFiltersCount}` : ""}
          </button>
        </div>
      </div>

      {/* Themes — horizontal scrollable chip strip. Sits ABOVE the rest
          of the filters because picking a theme is the most common entry
          point ("I want a beach trip"). Wrapped into rows so the user
          never has to side-scroll — 12 chips fit comfortably in 2 rows
          on most widths, more on narrow mobile. */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-ink-secondary">
            {t("catalog.themes")}
          </h2>
          {activeThemes.length > 0 && (
            <button
              onClick={() => setActiveThemes([])}
              className="text-xs font-semibold text-ink-secondary hover:text-ink-primary"
            >
              {t("catalog.clearN", { n: String(activeThemes.length) })}
            </button>
          )}
        </div>
        <div
          className="flex flex-wrap gap-2 pb-2"
          role="listbox"
          aria-label={t("catalog.themes")}
        >
          {themes.map((th) => {
            const on = activeThemes.includes(th.id);
            return (
              <button
                key={th.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() =>
                  setActiveThemes((prev) =>
                    prev.includes(th.id)
                      ? prev.filter((x) => x !== th.id)
                      : [...prev, th.id]
                  )
                }
                className={cn(
                  // Shared shape: a generous pill big enough to read at a
                  // glance, but compact enough that 12 themes flow in one row.
                  "inline-flex shrink-0 items-center gap-2 rounded-pill border px-4 py-2 text-sm font-semibold transition-all duration-200",
                  on
                    // Active = iOS-glass gradient pill + slight scale-up so
                    // it reads as "on" without the flat-blue harshness of
                    // a plain bg-blue-primary fill.
                    ? "chip-active scale-105"
                    // Inactive = soft brand gradient that intensifies on hover.
                    : "border-white/60 btn-soft"
                )}
              >
                <span className="text-base leading-none">{th.emoji}</span>
                <span>{softT(t, "theme", th.id)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active filter chips strip */}
      {activeFiltersCount > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {activeThemes.map((th) => (
            <FilterChip
              key={th}
              label={`#${softT(t, "theme", th)}`}
              onRemove={() => setActiveThemes((p) => p.filter((x) => x !== th))}
            />
          ))}
          {stars.map((s) => (
            <FilterChip key={s} label={`${s}★`} onRemove={() => setStars((p) => p.filter((x) => x !== s))} />
          ))}
          {countries.map((c) => (
            <FilterChip key={c} label={c} onRemove={() => setCountries((p) => p.filter((x) => x !== c))} />
          ))}
          {meals.map((m) => (
            <FilterChip key={m} label={softT(t, "meal", m)} onRemove={() => setMeals((p) => p.filter((x) => x !== m))} />
          ))}
          {onlyDiscount && <FilterChip label={t("catalog.discountedOnly").toLowerCase()} onRemove={() => setOnlyDiscount(false)} />}
          <button
            onClick={resetAll}
            className="ml-1 inline-flex items-center gap-1.5 rounded-pill bg-orange-soft/70 px-3 py-1 text-xs font-semibold text-orange-deep transition-colors hover:bg-orange-soft"
          >
            <X size={12} />
            {t("catalog.clearAll")} ({activeFiltersCount})
          </button>
        </div>
      )}

      {/* Main: sidebar filters + grid */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[300px_1fr]">
        <aside
          className={cn(
            "h-fit space-y-6 lg:sticky lg:top-24 lg:block",
            showFiltersMobile ? "block" : "hidden"
          )}
        >
          {/* Sidebar header with reset action — visible only when at least
              one filter is active, so the UI stays calm when not needed. */}
          {activeFiltersCount > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {activeFiltersCount} {t("catalog.active")}
              </span>
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-deep hover:text-orange-accent"
              >
                <X size={12} />
                {t("catalog.resetAll")}
              </button>
            </div>
          )}

          {/* Sliders only render once the server has reported the real
              min/max for the catalog (via `bounds`). Until then they'd
              be drawn against an arbitrary hard-coded scale — the May
              2026 user-testing iteration explicitly flagged that as
              confusing ("I can't even see where €1500 is on this bar").
              `bounds` and `priceRange` arrive in the same render so this
              guard is cheap. */}
          {bounds && priceRange && (
            <FilterCard title={t("catalog.budget")}>
              <RangeDouble
                min={bounds.priceMin}
                max={bounds.priceMax}
                // step=1 (not 50) so the user can actually drag to the
                // exact max. Native <input type="range"> only accepts
                // values that are integer multiples of `step` from min;
                // with step=50, min=690 the achievable maximum was
                // floor((5980-690)/50)*50 + 690 = 5940 — never 5980 —
                // which made the slider value silently disagree with
                // the read-out at the right endpoint.
                step={1}
                value={priceRange}
                onChange={setPriceRange}
                // Display each bound in the user's currency. Range itself
                // still operates on EUR — we only style the read-out.
                format={(v) => <Money eur={v} />}
                editable
              />
            </FilterCard>
          )}

          {bounds && nightsRange && (
            <FilterCard title={t("catalog.duration")}>
              <RangeDouble
                min={bounds.nightsMin}
                max={bounds.nightsMax}
                step={1}
                value={nightsRange}
                onChange={setNightsRange}
                format={(v) => `${v}`}
              />
            </FilterCard>
          )}

          <FilterCard title={t("catalog.filter.departureTitle")}>
            {/* One date by default (departure FROM). The "to" window is
                opt-in via a toggle — most users want "I want to leave on/
                after this date", not "between two specific dates". Mimics
                the one-way / return toggle on flight-search UIs. */}
            <DepartureFilter
              from={departFrom}
              to={departTo}
              onFromChange={setDepartFrom}
              onToChange={setDepartTo}
              onClear={() => { setDepartFrom(""); setDepartTo(""); }}
            />
          </FilterCard>

          <FilterCard title={t("catalog.hotelStars")}>
            <div className="flex flex-wrap gap-2">
              {[3, 4, 5].map((s) => {
                const on = stars.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() =>
                      setStars((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )
                    }
                    className={cn(
                      "chip",
                      on ? "bg-blue-primary text-white" : "chip-cream"
                    )}
                  >
                    {s}★
                  </button>
                );
              })}
            </div>
          </FilterCard>

          <FilterCard title={t("catalog.meal")}>
            <div className="space-y-2 text-sm">
              {allMeals.map((m) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-3 rounded-pill px-2 py-1 hover:bg-white/40"
                >
                  <input
                    type="checkbox"
                    checked={meals.includes(m)}
                    onChange={(e) =>
                      setMeals((prev) =>
                        e.target.checked ? [...prev, m] : prev.filter((x) => x !== m)
                      )
                    }
                    className="h-4 w-4 accent-blue-primary"
                  />
                  {softT(t, "meal", m)}
                </label>
              ))}
            </div>
          </FilterCard>

          <FilterCard title={t("catalog.countries")}>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm">
              {allCountries.map((c) => (
                <label
                  key={c}
                  className="flex cursor-pointer items-center gap-3 rounded-pill px-2 py-1 hover:bg-white/40"
                >
                  <input
                    type="checkbox"
                    checked={countries.includes(c)}
                    onChange={(e) =>
                      setCountries((prev) =>
                        e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)
                      )
                    }
                    className="h-4 w-4 accent-blue-primary"
                  />
                  {c}
                </label>
              ))}
            </div>
          </FilterCard>

          <FilterCard title={t("catalog.specialOffers")}>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={onlyDiscount}
                onChange={(e) => setOnlyDiscount(e.target.checked)}
                className="h-4 w-4 accent-orange-accent"
              />
              {t("catalog.discountedOnly")}
            </label>
          </FilterCard>

          <button
            onClick={resetAll}
            className="btn btn-ghost w-full justify-center border border-white/60"
          >
            {t("catalog.resetFilters")}
          </button>
        </aside>

        {/* Grid — self-start + auto-rows-min so a small result set (e.g. 1
            tour) doesn't get stretched to match the tall filter sidebar. */}
        {loading && allTours.length === 0 ? (
          <div className="self-start">
            <TourGridSkeleton count={6} />
          </div>
        ) : (
          <div className="self-start">
            <div className="stagger-grid grid auto-rows-min gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((t, i) => (
                // Clamp the index so a 60-card grid doesn't take 3.3s to settle —
                // past the 12th card we're below the fold anyway.
                <TourCard key={t.id} tour={t} style={{ "--i": Math.min(i, 12) } as React.CSSProperties} />
              ))}
              {filtered.length === 0 && (
                <GlassCard className="col-span-full p-10 text-center">
                  <div className="text-5xl">🤷</div>
                  <h3 className="mt-3 text-2xl font-extrabold">{t("catalog.nothingFound")}</h3>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {t("catalog.nothingFoundSub")}
                  </p>
                  <button onClick={resetAll} className="btn btn-primary mt-5">
                    {t("catalog.resetFilters")}
                  </button>
                </GlassCard>
              )}
            </div>

            {/* Infinite-scroll sentinel + status row.
                The empty <div> below is observed by IntersectionObserver
                inside <InfiniteScrollSentinel>; entering the viewport
                triggers `setSize(size + 1)` which loads the next page.
                When the catalog is exhausted we swap it for a quiet
                end-of-list note so the page doesn't look broken. */}
            {hasMore && (
              <InfiniteScrollSentinel
                onIntersect={() => setSize(size + 1)}
                loading={loadingMore}
              />
            )}
            {!hasMore && allTours.length > 0 && (
              <div className="mt-10 text-center text-xs text-ink-muted">
                — end of catalog —
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll-to-top floating button — appears after the user scrolls
          past 600px and disappears at the top. Right-bottom corner so
          it doesn't fight with the Ask-AI floating button on tour pages
          (different routes anyway). */}
      <ScrollToTopButton />
    </div>
  );
}

/** Sentinel that calls `onIntersect()` when it enters the viewport.
 *  Used by the catalog grid to load the next page of tours. */
function InfiniteScrollSentinel({
  onIntersect,
  loading,
}: {
  onIntersect: () => void;
  loading: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      // `rootMargin: 600px` triggers the load BEFORE the sentinel is
      // actually visible — the next page is usually ready by the time
      // the user reaches the bottom of the current one (no perceptible
      // pause).
      if (entries[0]?.isIntersecting) onIntersect();
    }, { rootMargin: "600px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect]);
  return (
    <div ref={ref} className="mt-10 grid place-items-center py-6">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-ink-secondary">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-blue-primary" />
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-blue-primary [animation-delay:120ms]" />
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-blue-primary [animation-delay:240ms]" />
        </div>
      )}
    </div>
  );
}

/** Floating "back to top" button. Visible after 600px of scroll.
 *
 *  Style: matches the rest of the catalogue's glass language — cream-tinted
 *  semi-transparent fill + 24px backdrop-blur + soft border ring, the same
 *  recipe used by GlassCard. Stays mounted (`opacity` + `translate-y` +
 *  `pointer-events: none` while hidden) so the fade is animated by the
 *  shared `transition-all duration-300`, not a hard mount/unmount.
 */
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Scroll to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed bottom-6 right-6 z-30 grid h-12 w-12 place-items-center rounded-full",
        // Glass surface — matches GlassCard tokens. backdrop-blur picks up
        // the cream/orange/blue gradient behind for the vibrancy effect.
        "border border-white/40 bg-cream/50 text-ink-primary shadow-glass backdrop-blur-[24px] backdrop-saturate-[180%]",
        "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-cream/70 hover:text-blue-deep hover:shadow-glass-lg",
        // Visibility — animate opacity + translate-y so the button slides
        // up into place instead of popping in. Disable pointer events while
        // hidden so it doesn't intercept clicks under it.
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 15 12 9 18 15" />
      </svg>
    </button>
  );
}

/* ============ helpers ============ */

/**
 * Banner shown for ~6s when the user lands here after hitting a dead tour
 * link (TourPage 404 → /catalog?missing=1). Auto-strips the param from the
 * URL so refresh doesn't re-show it.
 */
function MissingTourToast() {
  const [params, setParams] = useSearchParams();
  const [visible, setVisible] = useState(true);
  const { t } = useI18n();
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5500);
    // Clean up the URL immediately so refresh / share-link is clean.
    const next = new URLSearchParams(params);
    next.delete("missing");
    setParams(next, { replace: true });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!visible) return null;
  return (
    <div className="glass-strong animate-fade-up fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-pill px-6 py-3 text-sm shadow-glass-lg">
      {t("catalog.missingToast")}
    </div>
  );
}

function FilterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {title}
      </div>
      {children}
    </GlassCard>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip chip-cream">
      {label}
      <button
        onClick={onRemove}
        aria-label={`remove ${label}`}
        className="ml-1 grid h-4 w-4 place-items-center rounded-full hover:bg-white/60"
      >
        <X size={10} />
      </button>
    </span>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (k: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const sortLabelKey: Record<SortKey, string> = {
    "popular": "catalog.sort.popular",
    "price-asc": "catalog.sort.priceAsc",
    "price-desc": "catalog.sort.priceDesc",
    "rating": "catalog.sort.rating",
    "newest": "catalog.sort.newest",
    "discount": "catalog.sort.discount",
    "duration": "catalog.sort.duration",
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = (k: SortKey) => t(sortLabelKey[k] as any);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-pill bg-white/60 px-4 py-2.5 text-sm font-semibold shadow-soft hover:bg-white/80"
      >
        {label(value)}
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul className="glass-strong absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-glass p-1 text-sm">
            {sortKeys.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-glass px-3 py-2 text-left hover:bg-white/70",
                    k === value && "bg-white/60 font-semibold"
                  )}
                >
                  {label(k)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Number input that keeps a local draft string so the user can freely
 *  edit (backspace to empty, type a new value digit-by-digit) without
 *  the parent clamping it on every keystroke. The committed value is
 *  pushed up only on blur or Enter — that's when the slider snaps to
 *  the new figure. If the user blurs with an empty / invalid value we
 *  restore the last committed value rather than zeroing it out.
 *
 *  We also re-sync the local draft from `value` when the parent changes
 *  it (e.g. the slider thumb was dragged), so the input always shows
 *  what the slider is showing.
 */
function RangeNumberInput({
  value,
  commit,
  align,
}: {
  value: number;
  commit: (n: number) => void;
  align: "left" | "right";
}) {
  const [draft, setDraft] = useState<string>(String(value));
  // Keep draft in sync when the parent changes value externally (e.g.
  // slider drag). Comparing against the parsed draft avoids clobbering
  // an in-progress keystroke when nothing actually changed upstream.
  useEffect(() => {
    if (parseInt(draft, 10) !== value) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function flush() {
    const n = parseInt(draft.replace(/\D/g, ""), 10);
    if (Number.isNaN(n)) {
      // Restore last committed value if user emptied the field.
      setDraft(String(value));
      return;
    }
    commit(n);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={align === "left" ? "Minimum value" : "Maximum value"}
      className={cn(
        "w-20 rounded-lg border border-white/40 bg-white/60 px-2 py-1 text-sm font-semibold text-ink-primary focus:border-blue-primary focus:bg-white focus:outline-none",
        align === "right" && "text-right",
      )}
    />
  );
}

/** Двойной range на одном слайдере (бюджет, ночи). */
function RangeDouble({
  min,
  max,
  step,
  value,
  onChange,
  format,
  editable,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  format: (v: number) => React.ReactNode;
  /** When true, the min/max read-outs become editable number inputs
   *  (used for the budget slider — typing an exact figure is faster
   *  than dragging to it). */
  editable?: boolean;
}) {
  const [lo, hi] = value;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm font-semibold">
        {editable ? (
          <RangeNumberInput
            value={lo}
            commit={(n) => onChange([Math.max(min, Math.min(n, hi - step)), hi])}
            align="left"
          />
        ) : (
          <span>{format(lo)}</span>
        )}
        <span className="text-ink-muted">—</span>
        {editable ? (
          <RangeNumberInput
            value={hi}
            commit={(n) => onChange([lo, Math.min(max, Math.max(n, lo + step))])}
            align="right"
          />
        ) : (
          <span>{format(hi)}</span>
        )}
      </div>
      {/* Track + dual thumbs. Native range thumb is centred on the value
          position, so at min/max the thumb's half (10px = THUMB_RADIUS)
          spills past the input edges. We compensate with a 10px inner
          margin on both the inputs and the gray rail, and project the
          coloured fill into that same coordinate space via calc(). */}
      <div className="relative h-6">
        <div className="absolute left-[10px] right-[10px] top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/60" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-primary"
          style={{
            // Map [0..100]% of (max-min) onto the inset rail (10px padding
            // each side). Simplified: 10 + pct * (W - 20) / W = 10 + pct% - 0.2*pct px.
            left: `calc(10px + ${((lo - min) / (max - min)) * 100}% - ${0.2 * ((lo - min) / (max - min)) * 100}px)`,
            right: `calc(10px + ${100 - ((hi - min) / (max - min)) * 100}% - ${0.2 * (100 - ((hi - min) / (max - min)) * 100)}px)`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), hi - step);
            onChange([v, hi]);
          }}
          className="range-thumb pointer-events-none absolute left-[10px] right-[10px] top-0 h-6 appearance-none bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), lo + step);
            onChange([lo, v]);
          }}
          className="range-thumb pointer-events-none absolute left-[10px] right-[10px] top-0 h-6 appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}
