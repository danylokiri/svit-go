import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageCircle, Sparkles, Star, X } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import TourImage from "@/components/TourImage";
import { Money } from "@/components/Money";
import {
  ApiError,
  compareAnalysis,
  fetchTour,
  type CompareAnalysis,
  type Tour,
} from "@/api";
import {
  clearCompare,
  getCompareIds,
  setCompareIds,
  toggleCompareId,
} from "@/lib/compare";
import { softT, useI18n } from "@/lib/i18n";
import { cn, formatDate as fmtDate } from "@/lib/utils";

/**
 * Side-by-side compare view for up to 4 tours. Storage:
 *   - default = ids from localStorage (managed by `lib/compare`)
 *   - if URL has `?ids=a,b,c` we trust the URL (shareable links) and write
 *     it back to storage so subsequent visits keep the same selection.
 *
 * Layout is responsive: on desktop we render a row-label column + one
 * column per tour; on mobile we stack each tour as a card so the user
 * can swipe through them rather than fighting horizontal overflow.
 */
export default function ComparePage() {
  const { t, locale } = useI18n();
  const [searchParams] = useSearchParams();

  // Initial ids: URL > localStorage. URL also gets persisted so the user
  // can reload without losing the selection from a shared link.
  const [ids, setIds] = useState<string[]>(() => {
    const fromUrl = searchParams.get("ids");
    if (fromUrl) {
      const parsed = fromUrl
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length > 0) {
        setCompareIds(parsed);
        return parsed;
      }
    }
    return getCompareIds();
  });

  // Stay in sync with the rest of the app — TourCard's "remove from
  // compare" button fires the same custom event we listen to here so the
  // table updates without a reload.
  useEffect(() => {
    function sync() { setIds(getCompareIds()); }
    window.addEventListener("svitgo:compare-change", sync as EventListener);
    return () => window.removeEventListener("svitgo:compare-change", sync as EventListener);
  }, []);

  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(false);
  // Track non-404 errors separately. A 404 just means "tour was deleted"
  // and the slot quietly stays empty. A network/500 failure used to fall
  // through the same .catch() and looked identical to "you have no tours
  // to compare" — confusing (audit-final P1).
  const [networkError, setNetworkError] = useState(false);

  // Re-fetch whenever the id list changes. Parallel requests via SWR would
  // also work, but for a max-4 list this is simpler and avoids the
  // suspense plumbing in a leaf page.
  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      setTours([]);
      return;
    }
    setLoading(true);
    setNetworkError(false);
    Promise.all(
      ids.map((id) =>
        fetchTour(id).catch((e: unknown) => {
          // 404 = tour was deleted, treat as soft-miss. Anything else =
          // bubbleable error; we set a banner so the user can retry.
          if (e instanceof ApiError && e.status === 404) return null;
          if (!cancelled) setNetworkError(true);
          return null;
        }),
      ),
    ).then((results) => {
      if (cancelled) return;
      setTours(results.filter((x): x is Tour => x !== null));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [ids]);

  // AI pros/cons per tour. Fetched once we have ≥2 tours.
  const [analysesBySlug, setAnalysesBySlug] = useState<Map<string, CompareAnalysis>>(new Map());
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Trigger AI analysis when the set of tour slugs settles. The endpoint
  // takes a single round-trip per set, so we cache by joined-slugs key to
  // avoid re-asking when the user just toggles something unrelated.
  useEffect(() => {
    if (tours.length < 2) {
      setAnalysesBySlug(new Map());
      return;
    }
    let cancelled = false;
    const slugs = tours.map((t) => t.id);
    setAnalysisLoading(true);
    setAnalysisError(null);
    compareAnalysis(slugs, locale)
      .then((res) => {
        if (cancelled) return;
        const map = new Map<string, CompareAnalysis>();
        for (const a of res.analyses) map.set(a.slug, a);
        setAnalysesBySlug(map);
      })
      .catch((e) => {
        if (cancelled) return;
        setAnalysisError(e instanceof Error ? e.message : "failed");
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false);
      });
    return () => { cancelled = true; };
    // join slugs so we re-fetch only when the COMPOSITION actually changes,
    // not on every re-render that yields a fresh tours array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tours.map((t) => t.id).sort().join(","), locale]);

  // Empty state — no ids OR ids resolved to no tours.
  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-16">
        <h1 className="font-marker text-6xl leading-none md:text-7xl">{t("compare.title")}</h1>
        <GlassCard className="mt-10 p-10 text-center">
          <div className="text-5xl">⚖️</div>
          <h2 className="mt-4 text-2xl font-extrabold">{t("compare.empty.title")}</h2>
          <p className="mt-2 text-ink-secondary">{t("compare.empty.subtitle")}</p>
          <Link to="/catalog" className="btn btn-primary mt-6">{t("nav.catalog")}</Link>
        </GlassCard>
      </div>
    );
  }

  // Row schema. Defined as data so the desktop table and the mobile card
  // stacks render the same content — single source of truth.
  const rows: { key: string; label: string; render: (tour: Tour) => React.ReactNode }[] = [
    {
      key: "price",
      label: t("compare.column.price"),
      render: (tr) => (
        <div className="font-extrabold"><Money eur={tr.price} /></div>
      ),
    },
    {
      key: "duration",
      label: t("compare.column.duration"),
      render: (tr) => (
        <>
          {tr.durationNights} {tr.durationNights === 1 ? t("tour.night") : t("tour.nights")}
        </>
      ),
    },
    {
      key: "stars",
      label: t("compare.column.stars"),
      render: (tr) => "★".repeat(tr.hotelStars),
    },
    {
      key: "meal",
      label: t("compare.column.meal"),
      render: (tr) => softT(t, "meal", tr.meal),
    },
    {
      key: "themes",
      label: t("compare.column.themes"),
      render: (tr) => (
        <div className="flex flex-wrap gap-1">
          {tr.themes.map((th) => (
            <span key={th} className="chip chip-cream text-[11px]">
              {softT(t, "theme", th)}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "rating",
      label: t("compare.column.rating"),
      render: (tr) => {
        // Live rating: 0 reviews → no number to brag about. Showing "0.0"
        // looked like an actual user score and confused both the eye and
        // the LLM analysing the comparison earlier.
        if (!tr.reviews || tr.rating === 0) {
          return <span className="text-ink-muted">{t("compare.noRating")}</span>;
        }
        return (
          <span className="inline-flex items-center gap-1">
            <Star size={12} className="fill-orange-accent text-orange-accent" />
            {tr.rating.toFixed(1)}
            <span className="text-ink-muted">({tr.reviews})</span>
          </span>
        );
      },
    },
    {
      key: "next",
      label: t("compare.column.next"),
      render: (tr) => (tr.departures[0] ? fmtDate(tr.departures[0], locale) : "—"),
    },
    {
      key: "country",
      label: t("compare.column.country"),
      render: (tr) => tr.country,
    },
    {
      key: "city",
      label: t("compare.column.city"),
      render: (tr) => tr.city,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-16">
      <h1 className="font-marker text-6xl leading-none md:text-7xl">{t("compare.title")}</h1>
      <p className="mt-2 text-ink-secondary">
        {ids.length} / 4
      </p>

      {loading && tours.length === 0 ? (
        <GlassCard className="mt-10 p-10 text-center text-sm text-ink-secondary">
          {t("common.loading")}
        </GlassCard>
      ) : tours.length === 0 && networkError ? (
        // Distinct path from "all 404" — surface a retry CTA so the user
        // doesn't think their selection was cleared.
        <GlassCard className="mt-10 p-10 text-center">
          <h2 className="mt-4 text-2xl font-extrabold">{t("compare.error.title")}</h2>
          <p className="mt-2 text-ink-secondary">{t("compare.error.subtitle")}</p>
          <button
            type="button"
            onClick={() => setIds([...ids])}
            className="btn btn-primary mt-6"
          >
            {t("compare.error.retry")}
          </button>
        </GlassCard>
      ) : tours.length === 0 ? (
        // Ids existed but every fetch returned 404 (tours deleted/unavailable).
        <GlassCard className="mt-10 p-10 text-center">
          <h2 className="mt-4 text-2xl font-extrabold">{t("compare.empty.title")}</h2>
          <p className="mt-2 text-ink-secondary">{t("compare.empty.subtitle")}</p>
          <Link to="/catalog" className="btn btn-primary mt-6">{t("nav.catalog")}</Link>
        </GlassCard>
      ) : (
        <>
          {/* Desktop: row-label column + one column per tour. Grid keeps
              each cell aligned across rows, which a plain <table> can't
              easily do once we drop in image headers + chip lists. */}
          <div className="mt-8 hidden lg:block">
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `minmax(0,180px) repeat(${tours.length}, minmax(0,1fr))`,
              }}
            >
              {/* Header row */}
              <div />
              {tours.map((tr) => (
                <CompareHeader key={tr.id} tour={tr} />
              ))}

              {/* Body rows — Fragment with key lets a label + N cells share
                  the same iteration without breaking the grid flow. */}
              {rows.map((row) => (
                <Fragment key={row.key}>
                  <div className="text-xs font-bold uppercase tracking-wider text-ink-muted self-center">
                    {row.label}
                  </div>
                  {tours.map((tr) => (
                    <GlassCard key={`${row.key}-${tr.id}`} className="p-4 text-sm">
                      {row.render(tr)}
                    </GlassCard>
                  ))}
                </Fragment>
              ))}

              {/* AI insights row — per-tour pros/cons + "best for". */}
              <div className="self-start pt-4 text-xs font-bold uppercase tracking-wider text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={12} className="text-blue-deep" />
                  {t("compare.column.aiInsights")}
                </span>
              </div>
              {tours.map((tr) => (
                <AnalysisCell
                  key={`ai-${tr.id}`}
                  analysis={analysesBySlug.get(tr.id) ?? null}
                  loading={analysisLoading}
                  error={analysisError}
                />
              ))}

              {/* Per-tour booking CTA row — the user decides, not the system. */}
              <div />
              {tours.map((tr) => (
                <Link
                  key={`book-${tr.id}`}
                  to={`/booking?tour=${tr.id}`}
                  className="btn btn-primary w-full justify-center"
                >
                  {t("compare.bookThis")}
                </Link>
              ))}
            </div>
          </div>

          {/* Mobile: vertical stack of cards. Each card shows the same
              rows as the desktop table, just oriented top-to-bottom. */}
          <div className="mt-8 grid gap-6 lg:hidden">
            {tours.map((tr) => (
              <GlassCard key={tr.id} className="overflow-hidden">
                <CompareHeader tour={tr} />
                <dl className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                  {rows.map((row) => (
                    <div key={row.key} className="rounded-glass bg-white/40 p-3">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        {row.label}
                      </dt>
                      <dd className="mt-1 text-sm">{row.render(tr)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="space-y-3 px-5 pb-5">
                  <AnalysisCell
                    analysis={analysesBySlug.get(tr.id) ?? null}
                    loading={analysisLoading}
                    error={analysisError}
                  />
                  <Link
                    to={`/booking?tour=${tr.id}`}
                    className="btn btn-primary w-full justify-center"
                  >
                    {t("compare.bookThis")}
                  </Link>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Footer actions — discuss-in-chat is the new headline CTA,
              clear stays as a low-key secondary on the left. No automated
              "best deal" — the user picks per column above. */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => clearCompare()}
              className="btn btn-ghost border border-white/60"
            >
              <X size={14} />
              {t("compare.clear")}
            </button>
            <Link
              to={`/ai?compare=${tours.map((t) => t.id).join(",")}`}
              className="btn btn-primary"
            >
              <MessageCircle size={14} />
              {t("compare.discussInChat")}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** AI pros/cons card shown under each tour column. */
function AnalysisCell({
  analysis,
  loading,
  error,
}: {
  analysis: CompareAnalysis | null;
  loading: boolean;
  error: string | null;
}) {
  const { t } = useI18n();
  if (loading && !analysis) {
    return (
      <GlassCard className="p-4 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={12} className="animate-pulse text-blue-deep" />
          {t("compare.aiAnalyzing")}
        </span>
      </GlassCard>
    );
  }
  if (error && !analysis) {
    return (
      <GlassCard className="p-4 text-xs text-orange-deep">
        {t("compare.aiUnavailable")}
      </GlassCard>
    );
  }
  if (!analysis) return <div />;
  return (
    <GlassCard className="space-y-2 p-4 text-xs">
      {analysis.bestFor && (
        <div className="rounded-glass bg-blue-primary/10 px-2 py-1.5 font-semibold text-blue-deep">
          ✨ {analysis.bestFor}
        </div>
      )}
      {analysis.pros.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-deep">
            {t("compare.pros")}
          </div>
          <ul className="mt-1 space-y-0.5">
            {analysis.pros.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-ink-primary">
                <span className="mt-0.5 text-blue-primary">+</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {analysis.cons.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-deep">
            {t("compare.cons")}
          </div>
          <ul className="mt-1 space-y-0.5">
            {analysis.cons.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-ink-primary">
                <span className="mt-0.5 text-orange-accent">−</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}

function CompareHeader({ tour }: { tour: Tour }) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-glass border border-white/60 bg-white/40 shadow-soft",
      )}
    >
      <Link to={`/tour/${tour.id}`} className="block aspect-[16/9] overflow-hidden">
        <TourImage
          slug={tour.id}
          imageCount={tour.imageCount}
          alt={`${tour.city}, ${tour.country}`}
          sizes="(max-width: 1024px) 100vw, 25vw"
          loading="lazy"
        />
      </Link>
      <div className="p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          {tour.country} · {tour.city}
        </div>
        <Link
          to={`/tour/${tour.id}`}
          className="mt-1 line-clamp-2 text-sm font-bold hover:text-blue-deep"
        >
          {tour.title}
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <Link to={`/tour/${tour.id}`} className="text-xs font-semibold text-blue-deep">
            {t("compare.viewTour")} →
          </Link>
          <button
            type="button"
            onClick={() => toggleCompareId(tour.id)}
            aria-label={t("compare.remove")}
            className="ml-auto grid h-7 w-7 place-items-center rounded-full bg-white/70 text-ink-secondary transition-colors hover:bg-orange-soft hover:text-orange-deep"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// (local formatDate removed — now using locale-aware helper from @/lib/utils)
