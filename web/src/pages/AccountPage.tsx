import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import GlassCard from "@/components/GlassCard";
import TourCard from "@/components/TourCard";
import { Money } from "@/components/Money";
import FakePaymentModal from "@/components/FakePaymentModal";
import { cn, formatDate } from "@/lib/utils";
import {
  createReview,
  fetchBookings,
  fetchSaved,
  fetchTours,
  updatePrefs,
  type Booking,
  type CurrencyCode,
  type Theme,
  type Tour,
} from "@/api";
import { Star } from "lucide-react";
import { tourHero } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { BookingRowSkeleton, TourGridSkeleton } from "@/components/Skeleton";
import { useI18n } from "@/lib/i18n";

// Stable tab IDs — used for routing/state. Display labels resolved
// via i18n at render time so the UI follows the current locale.
const tabIds = ["bookings", "saved", "ai", "membership", "profile"] as const;
type TabId = (typeof tabIds)[number];

function isTabId(s: string): s is TabId {
  return (tabIds as readonly string[]).includes(s);
}

export default function AccountPage() {
  const [params, setParams] = useSearchParams();
  const initial: TabId = isTabId(params.get("tab") ?? "") ? (params.get("tab") as TabId) : "bookings";
  const [tab, setTab] = useState<TabId>(initial);
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState<{ bookings: number; saved: number } | null>(null);
  const tabLabel: Record<TabId, string> = {
    bookings: t("account.tab.bookings"),
    saved: t("account.tab.saved"),
    ai: t("account.tab.ai"),
    membership: t("account.tab.membership"),
    profile: t("account.tab.profile"),
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([fetchBookings(), fetchSaved()])
      .then(([b, s]) => { if (!cancelled) setStats({ bookings: b.length, saved: s.length }); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [user]);

  // Redirect to /auth if anonymous (after auth has finished loading)
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true, state: { from: "/account" } });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const slug = params.get("tab") ?? "";
    if (isTabId(slug) && slug !== tab) setTab(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function selectTab(next: TabId) {
    setTab(next);
    setParams({ tab: next }, { replace: true });
  }

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">
        {t("account.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* leading-[1.1] (not leading-none) — the marker font has tall
              ascenders/emoji that get clipped at leading-none under the
              fixed nav. Extra pt above keeps it clear of the header too. */}
          <h1 className="font-marker text-6xl leading-[1.1] md:text-7xl">
            {t("account.greeting", { name: user.name.split(" ")[0] })}
          </h1>
          <p className="mt-2 text-ink-secondary">
            {user.email}
            {stats && (
              <>
                {" · "}
                <b className="text-ink-primary">{t(stats.bookings === 1 ? "account.bookings1" : "account.bookings", { n: stats.bookings })}</b>
                {" · "}
                <b className="text-ink-primary">{t("account.saved", { n: stats.saved })}</b>
              </>
            )}
          </p>
        </div>
        <TierChip onClick={() => selectTab("membership")} createdAt={user.createdAt} />
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {tabIds.map((id) => (
          <button
            key={id}
            onClick={() => selectTab(id)}
            className={cn(
              "chip transition-colors",
              tab === id ? "bg-blue-primary text-white" : "chip-cream"
            )}
          >
            {tabLabel[id]}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "bookings"   && <BookingsTab />}
        {tab === "saved"      && <SavedTab />}
        {tab === "ai"         && <AiPrefs />}
        {tab === "membership" && <MembershipTab />}
        {tab === "profile"    && <Profile />}
      </div>
    </div>
  );
}

// ---- Tabs ----

function BookingsTab() {
  const [list, setList] = useState<Booking[] | null>(null);
  const [reviewingFor, setReviewingFor] = useState<Booking | null>(null);
  const { t } = useI18n();

  async function reload() {
    const rows = await fetchBookings();
    setList(rows);
  }
  useEffect(() => { reload().catch(console.error); }, []);

  if (!list) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <BookingRowSkeleton />
        <BookingRowSkeleton />
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <GlassCard className="p-10 text-center">
        <div className="text-3xl">🧳</div>
        <h3 className="mt-3 text-xl font-bold">{t("account.noBookings.title")}</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          {t("account.noBookings.body")}
        </p>
      </GlassCard>
    );
  }

  const upcoming = list.filter((b) => !b.isPast);
  const past     = list.filter((b) =>  b.isPast);

  return (
    <div className="space-y-12">
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-2xl font-extrabold">{t("account.upcoming")}</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {t(upcoming.length === 1 ? "account.upcomingSub1" : "account.upcomingSub", { n: upcoming.length })}
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {upcoming.map((b) => <BookingRow key={b.id} b={b} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-2xl font-extrabold">{t("account.past")}</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {t(past.length === 1 ? "account.pastSub1" : "account.pastSub", { n: past.length })}
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {past.map((b) => (
              <BookingRow
                key={b.id}
                b={b}
                onReview={!b.hasReview ? () => setReviewingFor(b) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {reviewingFor && (
        <ReviewModal
          booking={reviewingFor}
          onClose={() => setReviewingFor(null)}
          onSubmitted={async () => {
            setReviewingFor(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

/**
 * Tier chip on the account header — reads the live subscription and shows
 * Free / Plus / Pro accordingly. Previously the chip always said "Free plan"
 * regardless of actual tier, contradicting the membership tab below it.
 */
function TierChip({ onClick, createdAt }: { onClick: () => void; createdAt: string }) {
  const { t, locale } = useI18n();
  const sub = useSubscription();
  const labelKey =
    sub.tier === "pro"  ? "account.proPlan" :
    sub.tier === "plus" ? "account.plusPlan" :
                          "account.freePlan";
  const chipClass =
    sub.tier === "pro"  ? "bg-orange-accent text-white" :
    sub.tier === "plus" ? "bg-blue-primary text-white" :
                          "chip-blue";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-right transition-transform hover:scale-105"
    >
      <div className={cn("chip", chipClass)}>
        {t(labelKey)}
      </div>
      <div className="mt-1.5 text-xs text-ink-muted">
        {t("account.since", { date: formatDate(createdAt, locale, { month: "short", year: "numeric" }) })}
      </div>
    </button>
  );
}

function BookingRow({ b, onReview }: { b: Booking; onReview?: () => void }) {
  const hero = tourHero(b.tour.slug, b.tour.imageCount);
  const { t, locale } = useI18n();
  return (
    <GlassCard className="flex flex-col gap-3 overflow-hidden p-3 sm:flex-row sm:gap-4">
      <Link
        to={`/tour/${b.tour.slug}`}
        className="group block overflow-hidden rounded-glass sm:h-32 sm:w-40 sm:shrink-0"
      >
        <div
          className={cn(
            "grid h-32 w-full place-items-center text-5xl sm:h-full sm:w-40",
            !hero && "tinted-bg"
          )}
          style={hero ? undefined : { background: b.tour.gradient }}
        >
          {hero ? (
            <img src={hero} alt={`${b.tour.city}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : b.tour.emoji}
        </div>
      </Link>
      <div className="flex flex-1 flex-col py-2 pr-2">
        <div className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
          {b.tour.country} · {b.tour.city}
        </div>
        <Link to={`/tour/${b.tour.slug}`} className="text-lg font-bold hover:text-blue-deep">
          {b.tour.title}
        </Link>
        <div className="mt-1 text-xs text-ink-secondary">
          {b.startDate && (
            <>
              {formatDate(b.startDate, locale)}{" · "}
            </>
          )}
          {b.travelers.length} {b.travelers.length === 1 ? t("account.traveler") : t("account.travelers")} · {b.tour.meal}
        </div>
        {/* Personal note (dietary, anniversaries, ...) — surfaced so the
            user remembers what they asked for and so an operator could
            spot-check it during the demo. */}
        {b.specialRequest && (
          <div className="mt-1 text-xs italic text-ink-secondary">
            💬 {t("account.membership.specialRequest")}: {b.specialRequest}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <span className={cn("chip", b.isPast ? "chip-cream" : "chip-blue")}>
              {b.status}
            </span>
            {b.hasReview && <span className="chip chip-orange">{t("account.reviewed")}</span>}
          </div>
          <div className="flex items-center gap-3">
            {onReview && (
              <button
                onClick={onReview}
                className="rounded-pill bg-blue-primary px-3 py-1 text-xs font-semibold text-white hover:bg-blue-deep"
              >
                {t("account.writeReview")}
              </button>
            )}
            <span className="text-lg font-extrabold">
              <Money
                eur={b.totalPrice}
                forceCurrency={(b.currency || "EUR") as CurrencyCode}
                forceAmount={b.totalInCurrency ?? undefined}
                approximate
              />
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function ReviewModal({
  booking,
  onClose,
  onSubmitted,
}: {
  booking: Booking;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
}) {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoInput, setPhotoInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  // Lock body scroll + close on Esc while the modal is open. Same pattern as
  // ContactPopup — keeps the backdrop fully covering the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function submit() {
    if (!title.trim() || !body.trim()) {
      setError(t("account.review.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createReview({
        bookingId: booking.id,
        rating,
        title: title.trim(),
        body: body.trim(),
        photos,
      });
      await onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("account.review.couldNot"));
    } finally {
      setBusy(false);
    }
  }

  function addPhoto() {
    const v = photoInput.trim();
    if (!v) return;
    setPhotos((p) => [...p, v]);
    setPhotoInput("");
  }
  function removePhoto(i: number) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  // Portal to body so the modal escapes any parent stacking context — the
  // backdrop reliably covers the fixed header, and z-[100] sits above
  // everything (header z-30, account dropdown z-40).
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-ink-primary/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <GlassCard
        variant="strong"
        className="w-full max-w-lg p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-marker text-4xl leading-tight">{t("account.review.title", { city: booking.tour.city })}</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          {t("account.review.subtitle")}
        </p>

        <div className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("account.review.rating")}
          </div>
          <div className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="text-2xl transition-transform hover:scale-110"
              >
                <Star
                  size={28}
                  className={cn(
                    (hover ? n <= hover : n <= rating)
                      ? "fill-orange-accent text-orange-accent"
                      : "text-ink-muted"
                  )}
                />
              </button>
            ))}
            <span className="ml-2 text-sm text-ink-secondary">{rating} / 5</span>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{t("account.review.ratingTitle")}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("account.review.ratingTitlePlaceholder")}
            className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-base outline-none focus:bg-white/80"
            maxLength={120}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{t("account.review.body")}</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("account.review.bodyPlaceholder")}
            rows={5}
            className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-base outline-none focus:bg-white/80"
            maxLength={2000}
          />
        </label>

        <div className="mt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{t("account.review.photos")}</span>
          <div className="mt-2 flex gap-2">
            <input
              value={photoInput}
              onChange={(e) => setPhotoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())}
              placeholder="https://..."
              className="flex-1 rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            />
            <button onClick={addPhoto} className="rounded-pill bg-white/60 px-4 py-2 text-sm font-semibold hover:bg-white">
              {t("account.review.add")}
            </button>
          </div>
          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <span key={i} className="chip chip-cream max-w-[200px]">
                  <span className="truncate">{p}</span>
                  <button
                    onClick={() => removePhoto(i)}
                    aria-label={t("common.remove")}
                    className="ml-1 grid h-4 w-4 place-items-center rounded-full hover:bg-white/60"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-ghost">{t("account.ai.cancel")}</button>
          <button onClick={submit} disabled={busy} className="btn btn-primary disabled:opacity-60">
            {busy ? t("account.review.submitting") : t("account.review.submit")}
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body
  );
}

function SavedTab() {
  const [tours, setTours] = useState<Tour[] | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    (async () => {
      const slugs = await fetchSaved();
      if (slugs.length === 0) { setTours([]); return; }
      const all = await fetchTours({ limit: 60 });
      setTours(all.items.filter((tt) => slugs.includes(tt.id)));
    })().catch(console.error);
  }, []);

  if (!tours) return <TourGridSkeleton count={3} />;
  if (tours.length === 0) {
    return (
      <GlassCard className="p-10 text-center">
        <div className="text-3xl">♡</div>
        <h3 className="mt-3 text-xl font-bold">{t("account.saved.empty.title")}</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          {t("account.saved.empty.body")}
        </p>
      </GlassCard>
    );
  }
  return (
    <div className="stagger-grid grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {tours.map((t, i) => (
        <TourCard
          key={t.id}
          tour={t}
          style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function AiPrefs() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [budgetFrom, setBudgetFrom] = useState(user?.budgetFrom ?? 800);
  const [budgetTo, setBudgetTo]     = useState(user?.budgetTo ?? 1500);
  const [favThemes, setFavThemes]   = useState<string[]>(user?.favThemes ?? []);
  const [travelFreq, setTravelFreq] = useState(user?.travelFreq ?? "few-per-year");
  const [companion, setCompanion]   = useState(user?.companion ?? "partner");
  const [citizenship, setCitizenship] = useState(user?.citizenship ?? "UA");
  const [saving, setSaving] = useState(false);

  // Re-sync local form state when user data changes
  useEffect(() => {
    if (!user) return;
    setBudgetFrom(user.budgetFrom ?? 800);
    setBudgetTo(user.budgetTo ?? 1500);
    setFavThemes(user.favThemes ?? []);
    setTravelFreq(user.travelFreq ?? "few-per-year");
    setCompanion(user.companion ?? "partner");
    setCitizenship(user.citizenship ?? "UA");
  }, [user]);

  const allThemes = ["water","mountains","snow","temples","food","market","wellness","adventure","romantic","family","cities","nature"];

  async function save() {
    setSaving(true);
    try {
      await updatePrefs({
        budgetFrom: Number(budgetFrom),
        budgetTo: Number(budgetTo),
        favThemes: favThemes as Theme[],
        travelFreq,
        companion,
        citizenship,
      });
      await refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }
  function cancel() {
    if (!user) return;
    setBudgetFrom(user.budgetFrom ?? 800);
    setBudgetTo(user.budgetTo ?? 1500);
    setFavThemes(user.favThemes ?? []);
    setTravelFreq(user.travelFreq ?? "few-per-year");
    setCompanion(user.companion ?? "partner");
    setCitizenship(user.citizenship ?? "UA");
    setEditing(false);
  }

  function toggleTheme(theme: string) {
    setFavThemes((prev) =>
      prev.includes(theme) ? prev.filter((x) => x !== theme) : [...prev, theme]
    );
  }

  const themeEmojis: Record<string, string> = {
    water: "🌊", mountains: "⛰️", snow: "❄️", temples: "🏯",
    food: "🍜", market: "🛍️", wellness: "🧘", adventure: "🏕️",
    romantic: "💐", family: "👨‍👩‍👧", cities: "🏙️", nature: "🌿",
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const freqLabel = (f: string) => f ? t(`freq.${f}` as any) : "—";
  const companionLabel = (c: string) => {
    if (c === "solo") return t("companion.solo");
    if (c === "family") return t("companion.familyLabel");
    if (c === "friends") return t("companion.friendsLabel");
    return t("companion.partnerLabel");
  };

  // Common destinations for SvitGo's audience — keeps the dropdown short.
  // "Other" lets the user keep whatever value backend has if it's not listed.
  const citizenshipOptions: { code: string; flag: string; name: string }[] = [
    { code: "UA", flag: "🇺🇦", name: "Ukraine" },
    { code: "PL", flag: "🇵🇱", name: "Poland" },
    { code: "DE", flag: "🇩🇪", name: "Germany" },
    { code: "CZ", flag: "🇨🇿", name: "Czechia" },
    { code: "SK", flag: "🇸🇰", name: "Slovakia" },
    { code: "HU", flag: "🇭🇺", name: "Hungary" },
    { code: "RO", flag: "🇷🇴", name: "Romania" },
    { code: "MD", flag: "🇲🇩", name: "Moldova" },
    { code: "GE", flag: "🇬🇪", name: "Georgia" },
    { code: "GB", flag: "🇬🇧", name: "United Kingdom" },
    { code: "US", flag: "🇺🇸", name: "United States" },
    { code: "CA", flag: "🇨🇦", name: "Canada" },
    { code: "FR", flag: "🇫🇷", name: "France" },
    { code: "IT", flag: "🇮🇹", name: "Italy" },
    { code: "ES", flag: "🇪🇸", name: "Spain" },
    { code: "NL", flag: "🇳🇱", name: "Netherlands" },
    { code: "TR", flag: "🇹🇷", name: "Türkiye" },
    { code: "IL", flag: "🇮🇱", name: "Israel" },
  ];
  const citizenshipLabel = (c: string) => {
    const hit = citizenshipOptions.find((o) => o.code === c);
    return hit ? `${hit.flag} ${hit.name}` : (c || "—");
  };

  return (
    <GlassCard variant="strong" className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold">{t("account.ai.title")}</h2>
          <p className="mt-2 text-sm text-ink-secondary">
            {t("account.ai.subtitle")}
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn btn-primary px-5 py-2 text-sm">
            {t("account.ai.edit")}
          </button>
        )}
      </div>

      {!editing ? (
        // ============ VIEW ============
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ReadField label={t("account.ai.budget")} value={`€${user?.budgetFrom ?? 0} – €${user?.budgetTo ?? 0}`} />
          <ReadField
            label={t("account.ai.themes")}
            value={
              (user?.favThemes ?? []).length === 0
                ? "—"
                : (user?.favThemes ?? [])
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((th) => `${themeEmojis[th] ?? ""} ${t(`theme.${th}` as any)}`)
                    .join(" · ")
            }
          />
          <ReadField label={t("account.ai.frequency")} value={freqLabel(user?.travelFreq ?? "")} />
          <ReadField label={t("account.ai.companion")} value={companionLabel(user?.companion ?? "")} />
          <ReadField label={t("account.ai.citizenship")} value={citizenshipLabel(user?.citizenship ?? "")} />
        </div>
      ) : (
        // ============ EDIT ============
        <>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-glass bg-white/40 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("account.ai.budgetEdit")}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="number"
                  value={budgetFrom}
                  onChange={(e) => setBudgetFrom(Number(e.target.value))}
                  className="w-24 rounded-pill bg-white/60 px-3 py-1.5 text-sm outline-none"
                />
                <span className="text-ink-muted">—</span>
                <input
                  type="number"
                  value={budgetTo}
                  onChange={(e) => setBudgetTo(Number(e.target.value))}
                  className="w-24 rounded-pill bg-white/60 px-3 py-1.5 text-sm outline-none"
                />
              </div>
            </div>

            <div className="rounded-glass bg-white/40 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("account.ai.frequency")}
              </div>
              <select
                value={travelFreq}
                onChange={(e) => setTravelFreq(e.target.value)}
                className="mt-2 w-full rounded-pill bg-white/60 px-3 py-1.5 text-sm outline-none"
              >
                <option value="monthly">{t("freq.monthly")}</option>
                <option value="few-per-year">{t("freq.few-per-year")}</option>
                <option value="once-a-year">{t("freq.once-a-year")}</option>
              </select>
            </div>

            <div className="rounded-glass bg-white/40 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("account.ai.companion")}
              </div>
              <select
                value={companion}
                onChange={(e) => setCompanion(e.target.value)}
                className="mt-2 w-full rounded-pill bg-white/60 px-3 py-1.5 text-sm outline-none"
              >
                <option value="solo">{t("companion.solo")}</option>
                <option value="partner">{t("companion.partner")}</option>
                <option value="family">{t("companion.family")}</option>
                <option value="friends">{t("companion.friends")}</option>
              </select>
            </div>

            <div className="rounded-glass bg-white/40 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("account.ai.citizenship")}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {t("account.ai.citizenshipHint")}
              </p>
              <select
                value={citizenship}
                onChange={(e) => setCitizenship(e.target.value)}
                className="mt-2 w-full rounded-pill bg-white/60 px-3 py-1.5 text-sm outline-none"
              >
                {citizenshipOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.flag} {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 rounded-glass bg-white/40 p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("account.ai.themes")}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {allThemes.map((th) => {
                const on = favThemes.includes(th);
                return (
                  <button
                    key={th}
                    onClick={() => toggleTheme(th)}
                    className={cn(
                      "chip transition-colors",
                      on ? "bg-blue-primary text-white" : "chip-cream hover:bg-white/80"
                    )}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {themeEmojis[th]} {t(`theme.${th}` as any)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-60">
              {saving ? t("account.ai.saving") : t("account.ai.save")}
            </button>
            <button onClick={cancel} disabled={saving} className="btn btn-ghost">
              {t("account.ai.cancel")}
            </button>
          </div>
        </>
      )}
    </GlassCard>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-glass bg-white/40 p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

/**
 * Real membership tab — talks to SubscriptionContext. The marketing tier
 * grid lives on /pricing now; this tab is a status panel ("what do I have
 * right now, and how do I change it"). The legacy placeholder content
 * (LegacyMembershipShowcase) is preserved further down behind a flag so we
 * have a paper trail for the diploma defence.
 */
function MembershipTab() {
  const { t } = useI18n();
  const sub = useSubscription();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<null | "starting" | "cancelling">(null);
  /** Tier the user is paying for right now (modal open). */
  const [paying, setPaying] = useState<null | "plus" | "pro">(null);

  const tierName = (() => {
    if (sub.tier === "plus") return t("subscription.tier.plus");
    if (sub.tier === "pro")  return t("subscription.tier.pro");
    return t("subscription.tier.free");
  })();

  async function doCancel() {
    const ok = await confirm({
      title: t("pricing.confirmCancel.title"),
      body: t("pricing.confirmCancel.body"),
      confirmLabel: t("pricing.confirmCancel.confirm"),
      cancelLabel: t("pricing.confirmCancel.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy("cancelling");
    try { await sub.cancel(); } finally { setBusy(null); }
  }
  function startCheckout(target: "plus" | "pro") {
    setPaying(target);
  }
  async function completeCheckout() {
    if (!paying) return;
    setBusy("starting");
    try { await sub.start(paying); } finally { setBusy(null); }
  }
  async function doResubscribe() {
    if (sub.tier === "free") return;
    startCheckout(sub.tier);
  }

  return (
    <div className="space-y-6">
      <GlassCard variant="strong" className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("account.membership.currentTier")}
            </div>
            <h2 className="mt-1 text-3xl font-extrabold">{tierName}</h2>
            {sub.tier !== "free" && (
              <p className="mt-2 text-sm text-ink-secondary">
                {sub.cancelledAt
                  ? t("subscription.cancelledUntil", { date: formatDateShort(sub.renewsAt) })
                  : t("subscription.renewsAt", { date: formatDateShort(sub.renewsAt) })}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-blue-deep">
              {sub.tier === "free" ? "€0" : <Money eur={sub.tiers[sub.tier].monthlyPriceEUR} />}
            </div>
            <Link to="/pricing" className="text-xs text-blue-deep hover:underline">
              {t("account.membership.upgradeCta")}
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {sub.tier === "free" ? (
            <Link to="/pricing" className="btn btn-primary">
              {t("pricing.upgrade")}
            </Link>
          ) : sub.cancelledAt ? (
            <button onClick={doResubscribe} disabled={busy === "starting" || !user} className="btn btn-primary disabled:opacity-60">
              {busy === "starting" ? t("pricing.starting") : t("subscription.resubscribe")}
            </button>
          ) : (
            <button onClick={doCancel} disabled={busy === "cancelling"} className="btn btn-ghost disabled:opacity-60">
              {busy === "cancelling" ? t("pricing.cancelling") : t("pricing.cancelCta")}
            </button>
          )}
        </div>
      </GlassCard>

      {/* Plan comparison — three side-by-side cards, current tier dimmed.
          Same content as /pricing but inline here so the user doesn't have
          to navigate away to upgrade. */}
      <div className="grid gap-4 md:grid-cols-3">
        {(["free", "plus", "pro"] as const).map((tier) => {
          const f = sub.tiers[tier];
          const isCurrent = sub.tier === tier;
          const canUpgrade = !isCurrent && tier !== "free";
          return (
            <GlassCard
              key={tier}
              className={cn(
                "flex flex-col p-5",
                isCurrent && "ring-2 ring-blue-primary",
                tier === "pro" && "bg-gradient-to-br from-blue-primary/8 to-orange-accent/8",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  tier === "free" ? "bg-white/60 text-ink-secondary" :
                  tier === "plus" ? "bg-blue-primary/15 text-blue-deep" :
                  "bg-orange-accent/20 text-orange-deep",
                )}>
                  {f.label}
                </span>
                {isCurrent && (
                  <span className="rounded-pill bg-blue-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    {t("account.membership.currentTier")}
                  </span>
                )}
              </div>
              <div className="mt-3 text-3xl font-extrabold tracking-tight">
                {tier === "free" ? "€0" : <Money eur={f.monthlyPriceEUR} />}
                <span className="text-sm font-medium text-ink-muted"> / {t("payment.month")}</span>
              </div>

              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                <Bullet>
                  {f.aiDailyLimit == null
                    ? t("pricing.benefit.aiUnlimited")
                    : t("pricing.benefit.aiLimit", { n: String(f.aiDailyLimit) })}
                </Bullet>
                {f.earlyAccessHours > 0 && (
                  <Bullet>{t("pricing.benefit.earlyAccess", { n: String(f.earlyAccessHours) })}</Bullet>
                )}
                {f.cancelWindowHours > 0 && (
                  <Bullet>{t("pricing.benefit.cancelWindow", { n: String(f.cancelWindowHours) })}</Bullet>
                )}
                {f.conciergeEnabled && <Bullet>{t("pricing.benefit.concierge")}</Bullet>}
              </ul>

              <div className="mt-4">
                {isCurrent ? (
                  <button disabled className="btn btn-ghost w-full justify-center opacity-60">
                    {t("pricing.current")}
                  </button>
                ) : canUpgrade ? (
                  <button
                    onClick={() => startCheckout(tier)}
                    disabled={busy === "starting"}
                    className="btn btn-primary w-full justify-center disabled:opacity-60"
                  >
                    {sub.tier === "free" ? t("pricing.subscribe") : t("pricing.upgrade")}
                  </button>
                ) : (
                  // free vs paid current → option to downgrade by cancelling
                  <button
                    onClick={doCancel}
                    disabled={busy === "cancelling"}
                    className="btn btn-ghost w-full justify-center"
                  >
                    {t("pricing.cancelCta")}
                  </button>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Cancellation note */}
      <p className="text-center text-xs text-ink-muted">{t("membership.cancel")}</p>

      <FakePaymentModal
        open={paying != null}
        tier={paying ?? "plus"}
        priceEUR={paying ? sub.tiers[paying].monthlyPriceEUR : 0}
        onClose={() => setPaying(null)}
        onSuccess={completeCheckout}
      />
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-ink-primary">
      <span className="mt-0.5 text-blue-primary">✓</span>
      <span>{children}</span>
    </li>
  );
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// LegacyMembershipShowcase fully removed in audit-final cleanup.

function Profile() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  if (!user) return null;
  // Country name is locale-agnostic in the diploma demo (English form used
  // by the catalog backend) — only the flag emoji + name combo is shown.
  const flag: Record<string, string> = {
    UA: "🇺🇦 Ukraine", PL: "🇵🇱 Poland", DE: "🇩🇪 Germany", CZ: "🇨🇿 Czechia",
    SK: "🇸🇰 Slovakia", HU: "🇭🇺 Hungary", RO: "🇷🇴 Romania", MD: "🇲🇩 Moldova",
    GE: "🇬🇪 Georgia", GB: "🇬🇧 United Kingdom", US: "🇺🇸 United States",
    CA: "🇨🇦 Canada", FR: "🇫🇷 France", IT: "🇮🇹 Italy", ES: "🇪🇸 Spain",
    NL: "🇳🇱 Netherlands", TR: "🇹🇷 Türkiye", IL: "🇮🇱 Israel",
  };
  const citizenshipDisplay = user.citizenship
    ? (flag[user.citizenship] ?? user.citizenship)
    : "—";
  return (
    <GlassCard className="p-8">
      <h2 className="text-2xl font-extrabold">{t("account.profile.title")}</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Pref label={t("account.profile.name")} value={user.name} />
        <Pref label={t("account.profile.email")} value={user.email} />
        <Pref label={t("account.profile.citizenship")} value={citizenshipDisplay} />
        <Pref label={t("account.profile.memberSince")} value={formatDate(user.createdAt, locale)} />
      </div>
    </GlassCard>
  );
}

function Pref({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-glass bg-white/40 p-5">
      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}
// (Loading orphan component removed — was unused dead code per audit #8.)
