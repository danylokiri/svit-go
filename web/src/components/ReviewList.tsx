/**
 * Filterable review list — used on TourPage and OperatorPage.
 *
 * Controls:
 *   - Sort: newest / highest / lowest
 *   - Rating filter: all / 5★ only / 4★+ / 3★+
 *   - "With photos" toggle
 *
 * Filtering happens client-side because review counts are small (catalog
 * never has 1000+ reviews per tour). For larger datasets, push these into
 * query params and let the backend do it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, Star } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { cn, formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { Review } from "@/api";

type SortKey = "newest" | "highest" | "lowest";
type RatingFilter = "all" | "5" | "4plus" | "3plus";

interface Props<T extends Review = Review> {
  reviews: T[];
  /** Open a photo in your page's lightbox; if omitted, photos aren't clickable. */
  onOpenPhoto?: (photos: string[], index: number) => void;
  /** When false, hides the empty-state card (parent handles empty messaging). */
  showEmptyState?: boolean;
  /** Optional content rendered above the user/rating row of each card —
   *  used by OperatorPage to show "For [tour-name]" link per review. */
  renderHeader?: (review: T) => React.ReactNode;
}

export default function ReviewList<T extends Review>({
  reviews,
  onOpenPhoto,
  showEmptyState = true,
  renderHeader,
}: Props<T>) {
  const [sort, setSort] = useState<SortKey>("newest");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [withPhotosOnly, setWithPhotosOnly] = useState(false);
  const { t, locale } = useI18n();

  const filtered = useMemo(() => {
    let out = reviews.slice();
    if (ratingFilter === "5") out = out.filter((r) => r.rating === 5);
    if (ratingFilter === "4plus") out = out.filter((r) => r.rating >= 4);
    if (ratingFilter === "3plus") out = out.filter((r) => r.rating >= 3);
    if (withPhotosOnly) out = out.filter((r) => r.photos.length > 0);
    out.sort((a, b) => {
      if (sort === "newest") return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sort === "highest") return b.rating - a.rating;
      return a.rating - b.rating;
    });
    return out;
  }, [reviews, sort, ratingFilter, withPhotosOnly]);

  if (reviews.length === 0) {
    if (!showEmptyState) return null;
    return (
      <GlassCard className="p-10 text-center">
        <div className="text-5xl">💬</div>
        <p className="mt-3 text-sm text-ink-secondary">
          {t("tourPage.noReviews")}
        </p>
      </GlassCard>
    );
  }

  const ratingFilterLabel: Record<RatingFilter, string> = {
    all: t("reviewList.rating.all"),
    "5": t("reviewList.rating.5"),
    "4plus": t("reviewList.rating.4plus"),
    "3plus": t("reviewList.rating.3plus"),
  };
  const sortLabel: Record<SortKey, string> = {
    newest: t("reviewList.sort.newest"),
    highest: t("reviewList.sort.highest"),
    lowest: t("reviewList.sort.lowest"),
  };

  return (
    <div>
      {/* Filter strip — wraps onto two lines on narrow screens. */}
      <div className="flex flex-wrap items-center gap-2 rounded-glass bg-white/40 p-2">
        <SelectChip
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={Object.entries(sortLabel)}
          label={t("reviewList.sort")}
        />
        <SelectChip
          value={ratingFilter}
          onChange={(v) => setRatingFilter(v as RatingFilter)}
          options={Object.entries(ratingFilterLabel)}
          label={t("reviewList.rating")}
        />
        <button
          type="button"
          onClick={() => setWithPhotosOnly((v) => !v)}
          className={cn(
            "chip transition-colors",
            withPhotosOnly ? "bg-blue-primary text-white" : "chip-cream"
          )}
        >
          <Camera size={12} />
          {t("reviewList.withPhotos")}
        </button>
        <span className="ml-auto px-2 text-xs text-ink-muted">
          {filtered.length} {t("reviewList.of")} {reviews.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-glass bg-white/40 p-6 text-center text-sm text-ink-secondary">
          {t("reviewList.emptyMatch")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {filtered.map((r) => (
            <GlassCard key={r.id} className="p-6">
              {renderHeader && (
                <div className="mb-3">{renderHeader(r)}</div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-orange-accent text-sm font-bold text-white">
                    {r.user.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{r.user.name}</div>
                    <div className="text-xs text-ink-muted">
                      {formatDate(r.createdAt, locale, { month: "short", year: "numeric" })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={14}
                      className={cn(
                        n <= r.rating
                          ? "fill-orange-accent text-orange-accent"
                          : "text-ink-muted/40"
                      )}
                    />
                  ))}
                </div>
              </div>
              <h4 className="mt-4 text-lg font-bold leading-tight">{r.title}</h4>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-primary">
                {r.body}
              </p>
              {r.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.photos.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onOpenPhoto?.(r.photos, i)}
                      disabled={!onOpenPhoto}
                      className="block h-16 w-16 overflow-hidden rounded-glass transition-transform hover:scale-105 disabled:cursor-default"
                      aria-label="Open photo"
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Custom dropdown that matches the site's glass aesthetic. Replaces a
 * native <select> — the OS-rendered option list (especially in dark mode)
 * was inconsistent and looked out of place. This version:
 *   - Pill button styled like other chips
 *   - Glass popup with rounded corners and hover state
 *   - Checkmark next to the current option
 *   - Closes on outside click / Escape
 *   - Keyboard-accessible: Enter on items selects, Esc closes
 */
function SelectChip({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = options.find(([k]) => k === value)?.[1] ?? value;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium transition-colors",
          open
            ? "bg-white/85 text-ink-primary shadow-soft"
            : "bg-white/60 text-ink-primary hover:bg-white/80"
        )}
      >
        <span className="text-ink-muted">{label}:</span>
        <span className="font-semibold">{current}</span>
        <ChevronDown
          size={12}
          className={cn("text-ink-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="glass-strong animate-fade-up absolute left-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-glass p-1 text-sm shadow-glass-lg"
        >
          {options.map(([key, lab]) => {
            const selected = key === value;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onChange(key); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-glass px-3 py-2 text-left text-xs transition-colors",
                    selected
                      ? "bg-blue-primary/15 font-semibold text-ink-primary"
                      : "text-ink-primary hover:bg-white/60"
                  )}
                >
                  <span>{lab}</span>
                  {selected && <Check size={12} className="text-blue-deep" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
