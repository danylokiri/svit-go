import { Link, useNavigate } from "react-router-dom";
import { GitCompare, Heart, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import type { Tour } from "@/data/mockTours";
import { cn, tourHero } from "@/lib/utils";
import GlassCard from "./GlassCard";
import TourImage from "./TourImage";
import { Money } from "./Money";
import { showToast } from "./Toast";
import { softT, useI18n } from "@/lib/i18n";
import { getCompareIds, toggleCompareId, COMPARE_MAX } from "@/lib/compare";
import { toggleSaved } from "@/api";
import { useSaved } from "@/api/hooks";
import { useAuth } from "@/auth/AuthContext";

interface Props {
  tour: Tour;
  size?: "default" | "wide";
  /** Optional inline style — used by stagger-grid parents to inject
   *  `--i` so cards fade in sequentially. Forwarded to the outer Link. */
  style?: React.CSSProperties;
  /** When true, open the tour page in a new tab. Used in the AI chat so
   *  the user doesn't lose their conversation when previewing picks. */
  openInNewTab?: boolean;
}

export default function TourCard({ tour, size = "default", style, openInNewTab = false }: Props) {
  const wide = size === "wide";
  const hero = tourHero(tour.id, tour.imageCount);
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const meal = softT(t, "meal", tour.meal);
  const nightsWord = tour.durationNights === 1 ? t("tour.night") : t("tour.nights");

  const [inCompare, setInCompare] = useState(() => getCompareIds().includes(tour.id));
  useEffect(() => {
    function sync() { setInCompare(getCompareIds().includes(tour.id)); }
    window.addEventListener("svitgo:compare-change", sync as EventListener);
    return () => window.removeEventListener("svitgo:compare-change", sync as EventListener);
  }, [tour.id]);

  // Saved-state via the shared SWR cache. Every TourCard subscribes to the
  // same `"saved"` key so toggling on one card flips the heart everywhere.
  // For anon users we don't fetch — they can't save anyway, and the heart
  // becomes a "sign in" prompt instead.
  const { data: savedSlugs = [] } = useSaved(!!user);
  const { mutate } = useSWRConfig();
  const isSaved = savedSlugs.includes(tour.id);
  const [savingBusy, setSavingBusy] = useState(false);

  function onToggleCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const res = toggleCompareId(tour.id);
    if (res.reachedMax) {
      showToast(t("compare.reachedMax").replace("{max}", String(COMPARE_MAX)), "warn");
      return;
    }
    setInCompare(res.added);
  }

  async function onToggleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Anonymous users get a soft redirect to /auth. Showing a toast first
    // would let them lose the click target on the way to login — sending
    // them straight to /auth with a `from` state means they come back to
    // the same tour after sign-in.
    if (!user) {
      navigate("/auth", { state: { from: `/tour/${tour.id}` } });
      return;
    }
    if (savingBusy) return;
    setSavingBusy(true);
    // Optimistic update: flip the cache immediately so the heart visually
    // animates without waiting for the round-trip. If the request fails
    // we revert. The SWR key "saved" matches `useSaved` above.
    const optimistic = isSaved
      ? savedSlugs.filter((s) => s !== tour.id)
      : [...savedSlugs, tour.id];
    mutate("saved", optimistic, { revalidate: false });
    try {
      const r = await toggleSaved(tour.id);
      // Server is source of truth — replace with the actual list shape if
      // the optimistic guess was off (rare, but e.g. another tab modified).
      mutate("saved", (cur: string[] = []) =>
        r.saved ? Array.from(new Set([...cur, tour.id])) : cur.filter((s) => s !== tour.id),
        { revalidate: false },
      );
    } catch {
      // Roll back to the pre-click state on error.
      mutate("saved", savedSlugs, { revalidate: false });
      showToast(t("common.somethingWrong"), "warn");
    } finally {
      setSavingBusy(false);
    }
  }

  return (
    <Link
      to={`/tour/${tour.id}`}
      style={style}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      className="group block h-full w-full transition-transform duration-150 ease-out active:scale-[0.985]"
    >
      <GlassCard
        className={cn(
          "relative h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-glass-lg",
          wide && "flex"
        )}
      >
        <div
          className={cn(
            "relative shrink-0 overflow-hidden",
            !hero && "tinted-bg",
            wide ? "h-full w-64 min-h-[220px]" : "aspect-[4/3] w-full"
          )}
          style={hero ? undefined : { background: tour.gradient }}
        >
          {hero ? (
            <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
              <TourImage
                slug={tour.id}
                imageCount={tour.imageCount}
                alt={`${tour.city}, ${tour.country}`}
                sizes={wide
                  ? "(max-width: 1024px) 100vw, 512px"
                  : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
              />
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-7xl drop-shadow-md">
              {tour.emoji}
            </div>
          )}
          {tour.badge && (
            <div className="absolute left-3 top-3">
              {tour.badge === "ai" && (
                <span className="chip chip-cream">
                  ✦ {t("tour.aiPick")}{tour.matchScore != null ? ` · ${tour.matchScore}%` : ""}
                </span>
              )}
              {tour.badge === "hot" && <span className="chip chip-orange">🔥 {t("tour.hotDeal")}</span>}
              {tour.badge === "new" && <span className="chip chip-blue">✨ {t("tour.new")}</span>}
            </div>
          )}
          {tour.oldPrice && (
            <div className="absolute right-3 top-3 chip chip-orange">
              −{Math.round(100 - (tour.price / tour.oldPrice) * 100)}%
            </div>
          )}

          {/* Floating action cluster — heart (save) + compare. Both glass
              pills sitting on the photo; their active states use a brand
              gradient so the "yes I picked this" reads at thumbnail size.
              Heart is the more common action so it gets the first slot
              (rightmost, where the thumb naturally lands on mobile).

              On hover-capable devices the cluster is hidden until the
              user hovers the card (cleaner look at rest). Once any of
              the actions is ACTIVE (saved / in compare) the cluster
              pins itself open so the status stays glanceable. Touch
              devices always show the buttons — see `.card-actions` rules
              in index.css. */}
          <div
            className={cn(
              "card-actions absolute bottom-3 right-3 flex items-center gap-1.5",
              (isSaved || inCompare) && "card-actions-pinned",
            )}
          >
            <button
              type="button"
              onClick={onToggleCompare}
              aria-label={inCompare ? t("compare.remove") : t("compare.add")}
              title={inCompare ? t("compare.remove") : t("compare.add")}
              className={cn(
                "icon-btn-glass",
                inCompare && "icon-btn-glass-active",
              )}
            >
              <GitCompare size={15} />
            </button>
            <button
              type="button"
              onClick={onToggleSave}
              aria-label={isSaved ? t("tourPage.saved") : t("tourPage.save")}
              title={isSaved ? t("tourPage.saved") : t("tourPage.save")}
              className={cn(
                "icon-btn-glass",
                isSaved && "icon-btn-heart-active",
              )}
            >
              <Heart
                size={15}
                // Filled heart when saved — Lucide draws an outline by
                // default. `fill="currentColor"` picks up the active
                // white from icon-btn-heart-active.
                fill={isSaved ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <span>{tour.country}</span>
            <span>·</span>
            <span>{tour.city}</span>
          </div>
          <h3 className="text-lg font-bold leading-snug text-balance">
            {tour.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
            <span>{tour.durationNights} {nightsWord}</span>
            <span>·</span>
            <span>{"★".repeat(tour.hotelStars)}</span>
            <span>·</span>
            <span>{meal}</span>
          </div>

          <div className="mt-auto flex items-end justify-between pt-2">
            <div>
              {tour.oldPrice && (
                <div className="text-xs text-ink-muted line-through">
                  <Money eur={tour.oldPrice} />
                </div>
              )}
              <div className="text-2xl font-extrabold tracking-tight">
                <Money eur={tour.price} />
              </div>
            </div>
            {tour.reviews > 0 ? (
              <div className="flex items-center gap-1 text-sm font-semibold text-ink-secondary">
                <Star size={14} className="fill-orange-accent text-orange-accent" />
                <span>{tour.rating}</span>
                <span className="text-ink-muted">({tour.reviews})</span>
              </div>
            ) : (
              <span className="text-xs text-ink-muted">{t("tour.noReviews")}</span>
            )}
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}
