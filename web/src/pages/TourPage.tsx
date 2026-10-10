import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSWRConfig } from "swr";
import { ArrowLeft, Calendar, Check, GitCompare, Heart, Hotel, MapPin, MessageCircle, Minus, Plus, Sparkles, Star, Utensils, X } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import TourCard from "@/components/TourCard";
import Lightbox from "@/components/Lightbox";
import ReviewList from "@/components/ReviewList";
import { cn, tourGallery, tourHero } from "@/lib/utils";
import TourImage from "@/components/TourImage";
import { Money } from "@/components/Money";
import DeparturePicker from "@/components/DeparturePicker";
import {
  explainPick,
  fetchSaved,
  fetchTour,
  fetchTourReviews,
  fetchTours,
  toggleSaved,
  type ExplainPickResponse,
  type Review,
  type Tour,
} from "@/api";
import { getCompareIds, toggleCompareId } from "@/lib/compare";
import { useAuth } from "@/auth/AuthContext";
import { softT, useI18n } from "@/lib/i18n";

export default function TourPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const { mutate } = useSWRConfig();
  const [tour, setTour] = useState<Tour | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [related, setRelated] = useState<Tour[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inCompare, setInCompare] = useState(false);
  const [explain, setExplain] = useState<ExplainPickResponse | null>(null);
  /** Lightbox state — { source: which gallery to show, index: which image }. */
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; alt: string } | null>(null);
  /** Selected departure date — passed to BookingPage as ?startDate=…
   *  so the booking flow can prefill (and constrain) the date input. */
  const [selectedDepart, setSelectedDepart] = useState<string | null>(null);
  /** Passenger count — chosen here, applied as ?passengers=N on the booking
   *  link so the next page seeds the right number of empty traveler cards.
   *  Type (adult/child/senior) is selected per-card on the booking page. */
  const [paxCount, setPaxCount] = useState<number>(1);

  /** Sidebar "Ask about this tour" link — the floating action only appears
   *  once this button has scrolled out of view, so the two never compete. */
  const askInlineRef = useRef<HTMLAnchorElement | null>(null);
  const bookInlineRef = useRef<HTMLAnchorElement | null>(null);
  const [showFloatingAsk, setShowFloatingAsk] = useState(false);
  const [showStickyBook, setShowStickyBook] = useState(false);

  // Jump back to top when the user navigates between tours (e.g. clicks
  // a card in "Similar tours" — without this they land halfway down the page).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [id]);

  // Track sidebar Ask + Book buttons. Floating Ask + sticky Book appear
  // only once the inline ones have scrolled out of view so the two pairs
  // never compete for the user's attention.
  useEffect(() => {
    const askEl = askInlineRef.current;
    const bookEl = bookInlineRef.current;
    if (!askEl && !bookEl) {
      setShowFloatingAsk(false);
      setShowStickyBook(false);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === askEl) setShowFloatingAsk(!entry.isIntersecting);
          if (entry.target === bookEl) setShowStickyBook(!entry.isIntersecting);
        }
      },
      { threshold: 0 }
    );
    if (askEl) obs.observe(askEl);
    if (bookEl) obs.observe(bookEl);
    return () => obs.disconnect();
  }, [tour]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, rev] = await Promise.all([
          fetchTour(id),
          fetchTourReviews(id).catch(() => []),
        ]);
        if (cancelled) return;
        setTour(t);
        setReviews(rev);
        // Pull a larger pool, then rank by similarity to this tour.
        const list = await fetchTours({ limit: 40, sort: "popular" });
        if (cancelled) return;
        setRelated(pickSimilar(t, list.items, 3));
      } catch (e) {
        // 404 (tour was removed / typo in URL) — bounce to catalog with a
        // toast rather than the dead "Loading..." state.
        if (!cancelled) setNotFound(true);
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Redirect to /catalog when the tour can't be loaded. Done in an effect
  // so React isn't asked to navigate during render.
  useEffect(() => {
    if (notFound) {
      navigate("/catalog?missing=1", { replace: true });
    }
  }, [notFound, navigate]);

  useEffect(() => {
    if (!user || !id) return;
    fetchSaved().then((slugs) => setSaved(slugs.includes(id))).catch(console.error);
  }, [user, id]);

  // Keep the "in compare" pill state in sync with the localStorage-backed
  // compare list (works for anonymous users too — compare doesn't require auth).
  useEffect(() => {
    if (!tour) return;
    setInCompare(getCompareIds().includes(tour.id));
  }, [tour]);

  function onToggleCompare() {
    if (!tour) return;
    const r = toggleCompareId(tour.id);
    setInCompare(r.added);
  }

  // AI-generated "why this might fit" — uses tour data + user prefs
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    explainPick(id).then((r) => { if (!cancelled) setExplain(r); }).catch(console.error);
    return () => { cancelled = true; };
  }, [id, user]);

  async function onToggleSave() {
    if (!user) return;
    if (!tour) return;
    setBusy(true);
    try {
      const r = await toggleSaved(tour.id);
      setSaved(r.saved);
      // Sync the shared SWR cache so any TourCard mounted elsewhere (e.g.
      // "Similar tours" sidebar, related grid below) flips its heart
      // immediately too — without this they'd stay out of sync until the
      // user navigated to a page that re-fetched /api/saved.
      mutate(
        "saved",
        (cur: string[] = []) =>
          r.saved
            ? Array.from(new Set([...cur, tour.id]))
            : cur.filter((s) => s !== tour.id),
        { revalidate: false },
      );
    } finally {
      setBusy(false);
    }
  }

  if (!tour) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-10 text-sm text-ink-secondary">
        {t("common.loading")}
      </div>
    );
  }

  const hero = tourHero(tour.id, tour.imageCount);
  const gallery = tourGallery(tour.id, tour.imageCount);
  const allTourImages = hero ? [hero, ...gallery] : [];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10">
      <Link to="/catalog" className="inline-flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft size={14} />
        {t("tourPage.back")}
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        {/* Hero */}
        <div>
          <GlassCard className="overflow-hidden">
            <button
              type="button"
              onClick={() => hero && setLightbox({ images: allTourImages, index: 0, alt: `${tour.city}, ${tour.country}` })}
              className={cn(
                "group relative block aspect-[16/10] w-full overflow-hidden",
                !hero && "tinted-bg"
              )}
              style={hero ? undefined : { background: tour.gradient }}
              disabled={!hero}
              aria-label={hero ? "Open photo" : undefined}
            >
              {hero ? (
                <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                  <TourImage
                    slug={tour.id}
                    imageCount={tour.imageCount}
                    alt={`${tour.city}, ${tour.country}`}
                    sizes="(max-width: 1024px) 100vw, 60vw"
                    // Hero is above the fold — load eagerly so LCP is fast.
                    loading="eager"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 grid place-items-center text-[140px] drop-shadow-lg">
                  {tour.emoji}
                </div>
              )}
              {tour.oldPrice && (
                <div className="absolute right-4 top-4 chip chip-orange">
                  −{Math.round(100 - (tour.price / tour.oldPrice) * 100)}%
                </div>
              )}
            </button>
          </GlassCard>

          {gallery.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {gallery.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setLightbox({ images: allTourImages, index: i + 1, alt: `${tour.city} ${i + 1}` })}
                  className="group block aspect-square overflow-hidden rounded-glass"
                  aria-label="Open photo"
                >
                  <img
                    src={src}
                    alt={`${tour.city} ${i + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="mt-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <MapPin size={14} />
              <span>{tour.country}</span>
              <span>·</span>
              <span>{tour.city}</span>
            </div>
            <h1 className="font-marker mt-2 text-balance text-5xl leading-tight md:text-6xl">
              {tour.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {tour.themes.map((th) => (
                <span key={th} className="chip chip-cream">{softT(t, "theme", th)}</span>
              ))}
              {tour.reviews > 0 && (
                <span className="chip chip-blue">
                  <Star size={12} className="fill-current" /> {tour.rating} · {tour.reviews}
                </span>
              )}
            </div>
          </div>

          {/* About */}
          <GlassCard className="mt-8 p-8">
            <h2 className="text-2xl font-extrabold">{t("tourPage.about")}</h2>
            <div className="mt-4 whitespace-pre-line text-base leading-relaxed text-ink-primary">
              {tour.description}
            </div>

            {tour.highlights.length > 0 && (
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {tour.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-soft text-blue-deep">
                      <Check size={12} />
                    </span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {/* What's included / not included */}
          {(tour.included.length > 0 || tour.excluded.length > 0) && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {tour.included.length > 0 && (
                <GlassCard className="p-6">
                  <h3 className="text-lg font-bold">{t("tourPage.included")}</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {tour.included.map((x) => (
                      <li key={x} className="flex items-start gap-2.5">
                        <Check size={14} className="mt-0.5 shrink-0 text-blue-deep" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}
              {tour.excluded.length > 0 && (
                <GlassCard className="p-6">
                  <h3 className="text-lg font-bold">{t("tourPage.notIncluded")}</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {tour.excluded.map((x) => (
                      <li key={x} className="flex items-start gap-2.5">
                        <X size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                        <span className="text-ink-secondary">{x}</span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}
            </div>
          )}

          {/* Program */}
          {tour.program.length > 0 && (
            <GlassCard className="mt-6 p-8">
              <h2 className="text-2xl font-extrabold">{t("tourPage.program")}</h2>
              <ol className="mt-5 space-y-4 text-ink-primary">
                {tour.program.map((p) => (
                  <li key={p.day} className="flex gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-soft text-sm font-bold text-blue-deep">
                      {p.day}
                    </span>
                    <div>
                      <div className="font-semibold">{t("tourPage.day", { n: String(p.day) })} — {p.title}</div>
                      <div className="text-sm text-ink-secondary">{p.text}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </GlassCard>
          )}
        </div>

        {/* Booking sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <GlassCard variant="strong" className="p-6">
            <div className="flex items-end justify-between">
              <div>
                {tour.oldPrice && (
                  <div className="text-sm text-ink-muted line-through">
                    <Money eur={tour.oldPrice} />
                  </div>
                )}
                <div className="text-4xl font-extrabold"><Money eur={tour.price} /></div>
                <div className="text-xs text-ink-secondary">{t("tour.perPerson")}</div>
              </div>
              <div className="chip chip-orange">{t("tourPage.bestPrice")}</div>
            </div>

            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <Calendar size={16} className="text-ink-secondary" />
                {tour.durationNights} {tour.durationNights === 1 ? t("tour.night") : t("tour.nights")}
              </li>
              <li className="flex items-center gap-3">
                <Hotel size={16} className="text-ink-secondary" />
                {tour.hotelStars}★ {t("tourPage.hotel")}
              </li>
              <li className="flex items-center gap-3">
                <Utensils size={16} className="text-ink-secondary" />
                {softT(t, "meal", tour.meal)}
              </li>
            </ul>

            {/* Departure picker — shown only when the organiser has set
                concrete dates. Otherwise we point the user at the "flexible
                dates" path which sends them to the organiser via the booking
                form contact step. */}
            <div className="mt-6">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("tourPage.chooseDeparture")}
              </div>
              {tour.departures.length > 0 ? (
                <div className="mt-2">
                  <DeparturePicker
                    departures={tour.departures}
                    value={selectedDepart}
                    onChange={setSelectedDepart}
                    quickPickCount={4}
                  />
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-secondary">
                  {t("tourPage.flexibleDates")}
                </p>
              )}
            </div>

            {/* Passenger count — passed to /booking which seeds N empty
                traveler cards. Type (adult/child/senior) is chosen per card
                on the booking page itself. Capped at 8 to match the server
                schema `z.array().max(8)`. */}
            <div className="mt-6">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("tourPage.passengers")}
              </div>
              <div className="mt-2">
                <PaxRow
                  label={t("tourPage.pax.peopleLabel")}
                  value={paxCount}
                  min={1}
                  max={8}
                  onChange={setPaxCount}
                />
              </div>
            </div>

            <Link
              ref={bookInlineRef}
              to={buildBookingHref(tour.id, selectedDepart, paxCount)}
              className="btn btn-primary mt-6 w-full"
            >
              {t("tourPage.book")}
            </Link>
            <Link
              ref={askInlineRef}
              to={`/ai?tour=${tour.id}`}
              className="btn btn-soft mt-2 w-full justify-center"
            >
              <Sparkles size={16} className="text-blue-deep" />
              {t("tourPage.ask")}
            </Link>
            {/* Secondary tier — save (auth-only) + compare (anonymous-friendly).
                Visually subordinate to the two primary CTAs above: smaller
                padding, lighter ground, lower text-weight. Pilot user
                testing showed many participants didn't realise compare
                existed until after the booking page; surfacing it here as
                a smaller-but-always-visible link closes that gap without
                competing with the primary "Book this tour" CTA. */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {user && (
                <button
                  type="button"
                  onClick={onToggleSave}
                  disabled={busy}
                  className={cn(
                    "btn btn-sm justify-center transition-colors disabled:opacity-60",
                    saved
                      ? "bg-orange-soft/60 text-orange-deep hover:bg-orange-soft"
                      : "bg-white/60 text-ink-primary hover:bg-white",
                  )}
                >
                  <Heart size={14} className={saved ? "fill-orange-deep" : ""} />
                  {saved ? t("tourPage.saved") : t("tourPage.save")}
                </button>
              )}
              <button
                type="button"
                onClick={onToggleCompare}
                className={cn(
                  "btn btn-sm justify-center transition-colors",
                  user ? "" : "col-span-2",
                  inCompare
                    ? "bg-blue-soft/60 text-blue-deep hover:bg-blue-soft"
                    : "bg-white/60 text-ink-primary hover:bg-white",
                )}
              >
                <GitCompare size={14} />
                {inCompare ? t("compare.remove") : t("compare.add")}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-ink-muted">
              {t("tourPage.noDeposit")}
            </p>
          </GlassCard>

          {/* "Why the AI picked this" — personal AI-match summary. Hidden
              from anonymous users entirely: pilot user testing (May 2026)
              showed the generic-score + "sign in to see personal score" CTA
              read as advertising clutter without any value (Sergiy
              specifically called it noise). For logged-in users the block
              is meaningful because the matchScore reflects their saved
              AI-preferences. */}
          {explain && explain.personal && (
            <GlassCard className="p-6">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("tourPage.whyAi")}
                </div>
                <span
                  className={cn(
                    "chip text-xs",
                    explain.matchScore >= 75
                      ? "chip-blue"
                      : explain.matchScore >= 55
                        ? "chip-cream"
                        : "chip-orange"
                  )}
                >
                  {explain.matchScore}{t("tourPage.match")}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-primary">{explain.text}</p>
              {explain.signals.length > 1 && (
                <ul className="mt-3 space-y-1.5 text-xs text-ink-secondary">
                  {explain.signals.slice(0, 4).map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 text-blue-deep">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          )}

          {tour.organizer && (
            <Link to={`/operator/${tour.organizer.slug}`} className="block">
              <GlassCard className="p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glass-lg">
                <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("tourPage.runBy")}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white",
                      tour.organizer.type === "private"
                        ? "bg-gradient-to-br from-orange-accent to-blue-primary"
                        : "bg-gradient-to-br from-blue-primary to-blue-deep"
                    )}
                  >
                    {tour.organizer.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{tour.organizer.name}</div>
                    <div className="text-xs text-ink-secondary">
                      {tour.organizer.type === "private" ? t("tourPage.guide") : t("tourPage.operator")}
                      {tour.organizer.rating != null && (
                        <>
                          {" · ★ "}
                          {tour.organizer.rating.toFixed(1)}
                          {" · "}
                          {tour.organizer.reviewsCount}{" "}
                          {tour.organizer.reviewsCount === 1 ? t("tourPage.review") : t("tourPage.reviews")}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-secondary line-clamp-3">
                  {tour.organizer.bio}
                </p>
                <div className="mt-3 text-xs font-semibold text-blue-deep">
                  {t("tourPage.viewProfile")}
                </div>
              </GlassCard>
            </Link>
          )}
        </aside>
      </div>

      {/* Reviews */}
      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight">{t("tourPage.reviewsTitle")}</h2>
            <p className="mt-1 text-sm text-ink-secondary">
              {reviews.length === 0
                ? t("tourPage.noReviews")
                : t(reviews.length === 1 ? "tourPage.reviewsCountOne" : "tourPage.reviewsCount", { n: reviews.length })}
            </p>
          </div>
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 rounded-glass bg-white/60 px-4 py-2 shadow-soft">
              <Star size={18} className="fill-orange-accent text-orange-accent" />
              <span className="text-2xl font-extrabold">{tour.rating}</span>
              <span className="text-ink-secondary">/ 5</span>
            </div>
          )}
        </div>

        {reviews.length > 0 && (
          <div className="mt-6">
            <ReviewList
              reviews={reviews}
              onOpenPhoto={(photos, index) =>
                setLightbox({ images: photos, index, alt: "Review photo" })
              }
              showEmptyState={false}
            />
          </div>
        )}
      </section>

      <section className="mt-20">
        <h2 className="text-3xl font-extrabold tracking-tight">{t("tourPage.similar")}</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((t) => (
            <TourCard key={t.id} tour={t} />
          ))}
        </div>
      </section>

      {/* Floating "Ask AI" button (desktop) — only renders after the inline
          sidebar Ask button has scrolled out of view. */}
      <Link
        to={`/ai?tour=${tour.id}`}
        aria-hidden={!showFloatingAsk}
        tabIndex={showFloatingAsk ? 0 : -1}
        className={cn(
          "fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-pill bg-gradient-to-r from-blue-primary to-blue-deep px-5 py-3 text-sm font-semibold text-white shadow-glass-lg transition-all duration-300 hover:-translate-y-0.5 md:inline-flex",
          showFloatingAsk
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        <MessageCircle size={16} />
        {t("tourPage.askAboutCity", { city: tour.city })}
      </Link>

      {/* Sticky mobile booking bar — on phones the sidebar Book button
          scrolls out of view as soon as the user starts reading the
          description. This bar appears at that moment so the primary CTA
          is always one tap away. Hidden on md+ (sidebar Book is visible). */}
      <div
        aria-hidden={!showStickyBook}
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-white/40 bg-cream/90 px-4 py-3 backdrop-blur-md transition-transform duration-300 md:hidden",
          showStickyBook ? "translate-y-0" : "pointer-events-none translate-y-full"
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-ink-secondary">
              {tour.country} · {tour.city}
            </div>
            <div className="text-lg font-extrabold leading-tight">
              <Money eur={tour.price} />
              <span className="ml-1 text-xs font-normal text-ink-muted">/ {t("tour.perPerson")}</span>
            </div>
          </div>
          <Link
            to={buildBookingHref(tour.id, selectedDepart, paxCount)}
            tabIndex={showStickyBook ? 0 : -1}
            className="btn btn-primary shrink-0 px-5 py-2.5 text-sm"
          >
            {t("tourPage.bookNow")}
          </Link>
        </div>
      </div>

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox({ ...lightbox, index: i })}
          onClose={() => setLightbox(null)}
          alt={lightbox.alt}
        />
      )}
    </div>
  );
}

/**
 * Pick N tours that feel related to `t`. Score combines:
 *   - shared themes  (strongest signal — Jaccard over the themes array)
 *   - same region    (e.g. Europe, Asia — keeps the vibe close)
 *   - same country   (extra nudge when available)
 *   - price proximity (penalises wildly different price tiers)
 *   - duration proximity
 * We deliberately DON'T require an exact theme match — that often empties
 * the list. Same-region with overlapping themes is enough to feel related.
 */
function pickSimilar(target: Tour, pool: Tour[], n: number): Tour[] {
  const targetThemes = new Set(target.themes ?? []);
  const candidates = pool.filter((x) => x.id !== target.id);

  const scored = candidates.map((c) => {
    const ct = new Set(c.themes ?? []);
    // Jaccard for themes
    let shared = 0;
    for (const th of targetThemes) if (ct.has(th)) shared++;
    const union = targetThemes.size + ct.size - shared;
    const themeScore = union > 0 ? shared / union : 0;

    const sameRegion  = target.region  && c.region  === target.region  ? 1 : 0;
    const sameCountry = target.country && c.country === target.country ? 1 : 0;

    // 1 when prices match, drops to ~0 when ratio diverges by 2×
    const priceRatio = target.price > 0
      ? Math.min(c.price, target.price) / Math.max(c.price, target.price)
      : 0;

    // 1 at same length, falls off ~0.1 per night difference
    const nightDiff = Math.abs((c.durationNights ?? 0) - (target.durationNights ?? 0));
    const durationScore = Math.max(0, 1 - nightDiff * 0.1);

    const score =
      themeScore     * 3.0 +
      sameRegion     * 1.5 +
      sameCountry    * 1.0 +
      priceRatio     * 0.8 +
      durationScore  * 0.5;

    return { tour: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.tour);
}

/**
 * Build the `/booking?...` href with the selected departure date and the
 * passenger count. Omits passengers=1 to keep the URL clean — BookingPage
 * defaults to 1 traveler when the param is absent.
 */
function buildBookingHref(
  slug: string,
  startDate: string | null,
  passengers: number,
): string {
  const parts: string[] = [`tour=${slug}`];
  if (startDate) parts.push(`startDate=${startDate}`);
  if (passengers > 1) parts.push(`passengers=${passengers}`);
  return `/booking?${parts.join("&")}`;
}

/**
 * +/- stepper row used by the passenger-mix picker in the booking sidebar.
 * Buttons disable at their respective limits so the user can't push the
 * total above 8 (server cap) or below 0.
 */
function PaxRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="flex items-center justify-between rounded-glass bg-white/40 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="font-semibold text-ink-primary">{label}</div>
        {hint && <div className="text-[10px] text-ink-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label="-"
          className="grid h-7 w-7 place-items-center rounded-full bg-white/60 text-ink-primary transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={12} />
        </button>
        <span className="w-5 text-center text-sm font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label="+"
          className="grid h-7 w-7 place-items-center rounded-full bg-white/60 text-ink-primary transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
