import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, ExternalLink, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import TourImage from "@/components/TourImage";
import { Money } from "@/components/Money";
import { useOrganizerAuth } from "@/auth/OrganizerContext";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  fetchOrganizerTours,
  toggleOrganizerTourStatus,
  updateOrganizerProfile,
  type OrganizerTourEditable,
  type TourModerationStatus,
} from "@/api";

/**
 * Operator landing screen. Three blocks:
 *  - Header / greeting + sign-out
 *  - Inline-editable profile (the public operator page reflects this)
 *  - List of owned tours with quick links to edit / view public page
 */
export default function OrganizerDashboardPage() {
  const { organizer, loading, setOrganizer } = useOrganizerAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [tours, setTours] = useState<OrganizerTourEditable[] | null>(null);
  const [toursError, setToursError] = useState<string | null>(null);

  // Redirect to login if anonymous after hydration settles.
  useEffect(() => {
    if (!loading && !organizer) {
      navigate("/organizer/login", { replace: true });
    }
  }, [loading, organizer, navigate]);

  useEffect(() => {
    if (!organizer) return;
    let cancelled = false;
    fetchOrganizerTours()
      .then((rows) => { if (!cancelled) setTours(rows); })
      .catch((e) => { if (!cancelled) setToursError(e instanceof Error ? e.message : "failed"); });
    return () => { cancelled = true; };
  }, [organizer]);

  // Tally photos across all tours — a small but meaningful operator metric.
  const totalImages = useMemo(
    () => (tours ?? []).reduce((sum, x) => sum + (x.imageCount ?? 0), 0),
    [tours],
  );

  if (loading || !organizer) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">
        {t("organizer.dashboard.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 pt-20 pb-16">
      <header>
        {/* Heading itself links to the public operator page. The url chip
            sits below as a tiny "view public" affordance — no raw slug
            exposed at title size. Sign-out lives in the operator header
            now, not duplicated here.

            Block-level wrappers around each link so the subtitle sits on
            its own line — `<Link>` is inline by default, which made the
            two siblings flow together horizontally. */}
        <div>
          <Link
            to={`/operator/${organizer.slug}`}
            className="group inline-block"
          >
            <h1 className="font-marker text-5xl leading-[1.1] transition-colors group-hover:text-blue-deep md:text-6xl">
              {t("organizer.dashboard.greeting", { name: organizer.name })}
            </h1>
          </Link>
        </div>
        <div className="mt-2">
          <Link
            to={`/operator/${organizer.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-blue-deep"
          >
            {t("organizer.dashboard.subtitle")}
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <ExternalLink size={12} />
              {t("organizerHeader.viewPublic")}
            </span>
          </Link>
        </div>
      </header>

      <StatsRow
        toursCount={tours?.length ?? 0}
        images={totalImages}
        yearsActive={organizer.yearsActive}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/organizer/bookings" className="block">
          <GlassCard className="flex items-center gap-3 p-4 transition-colors hover:bg-white/60">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-primary/15 text-blue-deep">
              <Calendar size={18} />
            </span>
            <div>
              <div className="text-base font-extrabold">{t("organizer.dashboard.bookingsCard")}</div>
              <div className="text-xs text-ink-secondary">{t("organizer.dashboard.bookingsCardSub")}</div>
            </div>
          </GlassCard>
        </Link>
        <Link to="/organizer/tours/new" className="block">
          <GlassCard className="flex items-center gap-3 p-4 transition-colors hover:bg-white/60">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-orange-soft text-orange-deep">
              <Plus size={18} />
            </span>
            <div>
              <div className="text-base font-extrabold">{t("organizer.dashboard.newTour")}</div>
              <div className="text-xs text-ink-secondary">{t("organizer.dashboard.newTourSub")}</div>
            </div>
          </GlassCard>
        </Link>
      </div>

      <ProfileCard
        initial={organizer}
        onSaved={(o) => setOrganizer(o)}
      />

      <YourToursSection tours={tours} error={toursError} onChanged={() => {
        fetchOrganizerTours().then(setTours).catch(() => undefined);
      }} />
    </div>
  );
}

function StatsRow({ toursCount, images, yearsActive }: { toursCount: number; images: number; yearsActive: number }) {
  const { t } = useI18n();
  const items: { label: string; value: number }[] = [
    { label: t("organizer.dashboard.statsTours"), value: toursCount },
    { label: t("organizer.dashboard.statsImages"), value: images },
    { label: t("organizer.dashboard.statsYears"), value: yearsActive },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <GlassCard key={it.label} className="p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {it.label}
          </div>
          <div className="mt-1 text-3xl font-extrabold text-ink-primary">{it.value}</div>
        </GlassCard>
      ))}
    </div>
  );
}

/**
 * Tours list + search + sort. Tiny client-side filter — at 1000 tours it
 * still renders in <50ms because the rows are simple. Beyond that, server-
 * side pagination would be the next step (we already have organizer-scoped
 * /api/organizer/tours, so it's a small change to add `q=` + `sort=`).
 */
type SortKey = "newest" | "oldest" | "price-asc" | "price-desc" | "title-asc";

function YourToursSection({
  tours,
  error,
  onChanged,
}: {
  tours: OrganizerTourEditable[] | null;
  error: string | null;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const hasMixedStatus = useMemo(
    () => (tours ?? []).some((tt) => tt.status !== "active"),
    [tours],
  );

  const filtered = useMemo(() => {
    if (!tours) return null;
    const q = query.trim().toLowerCase();
    const rows = q
      ? tours.filter((tt) =>
          tt.title.toLowerCase().includes(q) ||
          tt.city.toLowerCase().includes(q) ||
          tt.country.toLowerCase().includes(q),
        )
      : tours.slice();
    rows.sort((a, b) => {
      switch (sort) {
        case "newest":    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "price-asc": return a.price - b.price;
        case "price-desc":return b.price - a.price;
        case "title-asc": return a.title.localeCompare(b.title);
        default: return 0;
      }
    });
    return rows;
  }, [tours, query, sort]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold">{t("organizer.dashboard.yourTours")}</h2>
        <div className="flex items-center gap-2">
          {/* Search input — always visible so operators can find tours without
              waiting for a magic threshold. */}
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("organizer.dashboard.searchPlaceholder")}
              className="search-pill w-44 rounded-pill bg-white/60 py-1.5 pl-8 pr-3 text-sm outline-none sm:w-56"
            />
          </div>
          {tours && tours.length > 0 && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-pill bg-white/60 px-3 py-1.5 text-sm font-semibold outline-none transition-colors hover:bg-white/80"
            >
              <option value="newest">{t("organizer.dashboard.sort.newest")}</option>
              <option value="oldest">{t("organizer.dashboard.sort.oldest")}</option>
              <option value="price-asc">{t("organizer.dashboard.sort.priceAsc")}</option>
              <option value="price-desc">{t("organizer.dashboard.sort.priceDesc")}</option>
              <option value="title-asc">{t("organizer.dashboard.sort.titleAsc")}</option>
            </select>
          )}
          <Link
            to="/organizer/tours/new"
            className="btn btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <Plus size={14} />
            {t("organizer.dashboard.newTour")}
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
          {error}
        </div>
      )}

      {!filtered ? (
        <div className="mt-4 text-sm text-ink-secondary">{t("organizer.edit.loading")}</div>
      ) : tours && tours.length === 0 ? (
        <GlassCard className="mt-4 p-8 text-sm text-ink-secondary">
          {t("organizer.dashboard.noTours")}
        </GlassCard>
      ) : filtered.length === 0 ? (
        // Query produced no hits — distinct copy from "you have no tours".
        <GlassCard className="mt-4 p-8 text-center text-sm text-ink-secondary">
          {t("organizer.dashboard.noMatch", { q: query })}
        </GlassCard>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {filtered.map((tt) => (
            <TourRow
              key={tt.slug}
              tour={tt}
              showActiveBadge={hasMixedStatus}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface OrganizerLike {
  name: string;
  bio: string;
  phone: string;
  whatsapp: string | null;
  yearsActive: number;
}

function ProfileCard({
  initial,
  onSaved,
}: {
  initial: OrganizerLike & { id: number; slug: string; type: "company" | "private"; email: string; avatarUrl: string | null; verified: boolean; createdAt: string };
  onSaved: (o: typeof initial) => void;
}) {
  const { t } = useI18n();
  // Read-only by default. Click "Edit profile" → fields become editable
  // and save/cancel show up. Mirrors the regular user account behaviour.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio);
  const [phone, setPhone] = useState(initial.phone);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp ?? "");
  const [years, setYears] = useState(initial.yearsActive);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");

  useEffect(() => {
    setName(initial.name);
    setBio(initial.bio);
    setPhone(initial.phone);
    setWhatsapp(initial.whatsapp ?? "");
    setYears(initial.yearsActive);
  }, [initial]);

  function cancel() {
    // Roll back any in-progress edits to the last saved state.
    setName(initial.name);
    setBio(initial.bio);
    setPhone(initial.phone);
    setWhatsapp(initial.whatsapp ?? "");
    setYears(initial.yearsActive);
    setEditing(false);
    setStatus("idle");
  }

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const updated = await updateOrganizerProfile({
        name: name.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || null,
        yearsActive: Number(years) || 0,
      });
      onSaved(updated);
      setStatus("ok");
      setEditing(false);
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard variant="strong" className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">{t("organizer.dashboard.profile")}</h2>
          <p className="mt-1 text-sm text-ink-secondary">{t("organizer.dashboard.profileSub")}</p>
        </div>
        <div className="flex items-center gap-2">
          {status === "ok" && <span className="chip chip-blue">{t("organizer.dashboard.profileSaved")}</span>}
          {status === "err" && <span className="chip chip-orange">{t("organizer.dashboard.profileError")}</span>}
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-pill bg-white/60 px-3 py-1.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-white/80"
            >
              <Pencil size={13} />
              {t("organizer.dashboard.editProfile")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field
          label={t("organizer.dashboard.name")}
          value={name}
          onChange={setName}
          editing={editing}
        />
        <Field
          label={t("organizer.dashboard.phone")}
          value={phone}
          onChange={setPhone}
          editing={editing}
        />
        <Field
          label={t("organizer.dashboard.whatsapp")}
          value={whatsapp}
          onChange={setWhatsapp}
          editing={editing}
          placeholder="—"
        />
        <Field
          label={t("organizer.dashboard.yearsActive")}
          value={String(years)}
          onChange={(v) => setYears(Number(v) || 0)}
          editing={editing}
          type="number"
        />
        <div className="md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("organizer.dashboard.bio")}
          </span>
          {editing ? (
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={2000}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-sm outline-none focus:bg-white/80"
            />
          ) : (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-primary">
              {bio || <span className="text-ink-muted">—</span>}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="btn btn-ghost"
          >
            {t("organizer.dashboard.cancelEdit")}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-primary disabled:opacity-60"
          >
            {saving ? t("organizer.dashboard.savingProfile") : t("organizer.dashboard.saveProfile")}
          </button>
        </div>
      )}
    </GlassCard>
  );
}

/**
 * Field that renders as styled text when read-only, as an input when editing.
 * Keeps the visual rhythm identical between modes (no "fields rearrange on edit").
 */
function Field({
  label,
  value,
  onChange,
  editing,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      {editing ? (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
        />
      ) : (
        <div
          className={cn(
            "mt-2 truncate text-sm",
            value ? "text-ink-primary" : "text-ink-muted",
          )}
        >
          {value || placeholder || "—"}
        </div>
      )}
    </div>
  );
}

function TourRow({
  tour,
  showActiveBadge,
  onChanged,
}: {
  tour: OrganizerTourEditable;
  showActiveBadge: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  return (
    <GlassCard className="relative flex flex-col gap-3 overflow-visible p-3 sm:flex-row">
      <div className="overflow-hidden rounded-glass bg-cream-2 sm:h-32 sm:w-40 sm:shrink-0">
        {tour.imageCount > 0 ? (
          <TourImage
            slug={tour.slug}
            imageCount={tour.imageCount}
            alt={tour.title}
            sizes="160px"
            className="h-32 w-full object-cover sm:h-full sm:w-40"
          />
        ) : (
          <div className="grid h-32 w-full place-items-center text-3xl text-ink-muted sm:h-full sm:w-40">
            ✈
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col py-1 pr-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
              {tour.country} · {tour.city}
            </div>
            <div className="text-lg font-bold leading-tight">{tour.title}</div>
          </div>
          <div className="flex items-center gap-1">
            <TourStatusChip
              status={tour.status}
              rejectionReason={tour.rejectionReason}
              showActiveBadge={showActiveBadge}
            />
            {(tour.status === "active" || tour.status === "disabled") && (
              <TourActionsMenu tour={tour} onChanged={onChanged} />
            )}
          </div>
        </div>
        <div className="mt-1 text-xs text-ink-secondary">
          {tour.durationNights}n · {tour.hotelStars}★ · {tour.meal}
        </div>
        {/* Visible rejection reason — used to be hidden in a hover-only chip
            tooltip which organisers don't discover (audit-final F12). Now
            renders inline on rejected rows, truncated to keep cards compact;
            full text + resubmit guidance is on the tour edit page. */}
        {tour.status === "rejected" && tour.rejectionReason && (
          <div className="mt-1 rounded-glass bg-orange-soft/50 px-2 py-1 text-[11px] leading-snug text-orange-deep">
            <span className="font-bold">{t("organizer.dashboard.rejectionReason")}:</span>{" "}
            {tour.rejectionReason.length > 120
              ? tour.rejectionReason.slice(0, 120) + "…"
              : tour.rejectionReason}
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="text-base font-extrabold">
            <Money eur={tour.price} />
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/tour/${tour.slug}`}
              className="chip chip-cream text-xs"
            >
              {t("organizer.dashboard.viewPublic")}
            </Link>
            <Link
              to={`/organizer/tours/${tour.slug}`}
              className="btn btn-primary px-3 py-1.5 text-xs"
            >
              {t("organizer.dashboard.editTour")}
            </Link>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function TourStatusChip({
  status,
  rejectionReason,
  showActiveBadge,
}: {
  status: TourModerationStatus;
  rejectionReason: string | null;
  showActiveBadge: boolean;
}) {
  const { t } = useI18n();
  if (status === "active" && !showActiveBadge) return null;
  const map: Record<TourModerationStatus, { cls: string; label: string }> = {
    pending: { cls: "chip-orange", label: t("organizer.status.pending") },
    active: { cls: "chip-blue", label: t("organizer.status.active") },
    disabled: { cls: "chip-cream", label: t("organizer.status.disabled") },
    rejected: { cls: "chip-orange", label: t("organizer.status.rejected") },
  };
  const { cls, label } = map[status];
  return (
    <span
      className={cn("chip text-[10px]", cls)}
      title={status === "rejected" && rejectionReason ? rejectionReason : undefined}
    >
      {label}
    </span>
  );
}

function TourActionsMenu({
  tour,
  onChanged,
}: {
  tour: OrganizerTourEditable;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  async function toggle() {
    setBusy(true);
    try {
      await toggleOrganizerTourStatus(
        tour.slug,
        tour.status === "active" ? "disabled" : "active",
      );
      onChanged();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
        className="grid h-7 w-7 place-items-center rounded-full bg-white/60 text-ink-secondary transition-colors hover:bg-white/80"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="glass-strong absolute right-0 top-9 z-20 w-44 rounded-glass p-1 text-sm shadow-glass-lg">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="block w-full rounded-glass px-3 py-2 text-left transition-colors hover:bg-white/60 disabled:opacity-60"
          >
            {tour.status === "active"
              ? t("organizer.actions.disable")
              : t("organizer.actions.enable")}
          </button>
        </div>
      )}
    </div>
  );
}
