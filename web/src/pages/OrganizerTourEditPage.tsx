import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import GlassCard from "@/components/GlassCard";
import DatePopover from "@/components/DatePopover";
import { useOrganizerAuth } from "@/auth/OrganizerContext";
import { useI18n, softT } from "@/lib/i18n";
import { cn, tourGallery, tourHero } from "@/lib/utils";
import {
  deleteOrganizerGalleryImage,
  fetchOrganizerTours,
  toggleOrganizerTourStatus,
  updateOrganizerTour,
  uploadOrganizerImage,
  type OrganizerTourEditable,
  type ProgramDay,
  type Theme,
} from "@/api";

/**
 * Editable tour page for operators. Sections live in one scrollable column
 * with a sticky section nav — accordions felt heavy when 90% of operators
 * just want to "edit title and bump the price". Each section saves
 * independently so a partial edit can't leak into another section.
 */

type SectionId = "basics" | "pricing" | "departures" | "photos" | "program" | "lists";
const SECTIONS: SectionId[] = ["basics", "pricing", "departures", "photos", "program", "lists"];

const ALL_THEMES: Theme[] = [
  "water", "mountains", "snow", "temples", "food", "market",
  "wellness", "adventure", "romantic", "family", "cities", "nature",
];

const MEAL_OPTIONS = ["Breakfast", "Half board", "Full board", "All inclusive", "No meals", "Self-catering"];

export default function OrganizerTourEditPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { organizer, loading: orgLoading } = useOrganizerAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [tour, setTour] = useState<OrganizerTourEditable | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [bumpToast, setBumpToast] = useState(false);
  const [reenableBusy, setReenableBusy] = useState(false);

  // Redirect if not logged in once hydration settles.
  useEffect(() => {
    if (!orgLoading && !organizer) {
      navigate("/organizer/login", { replace: true });
    }
  }, [orgLoading, organizer, navigate]);

  async function refreshTour() {
    const all = await fetchOrganizerTours();
    const hit = all.find((x) => x.slug === slug);
    if (!hit) { setNotFound(true); setTour(null); return; }
    setNotFound(false);
    setTour(hit);
  }

  useEffect(() => {
    if (!organizer || !slug) return;
    refreshTour().catch(() => setNotFound(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizer, slug]);

  // Sections post a `svitgo:tour-bumped` window event when their save call
  // returns bumpedToPending: true — we use this to surface a single toast at
  // page level instead of every section reinventing one.
  useEffect(() => {
    function onBump(e: Event) {
      const detail = (e as CustomEvent).detail as { slug?: string } | undefined;
      if (detail?.slug && detail.slug === slug) {
        setBumpToast(true);
        window.setTimeout(() => setBumpToast(false), 4000);
      }
    }
    window.addEventListener("svitgo:tour-bumped", onBump);
    return () => window.removeEventListener("svitgo:tour-bumped", onBump);
  }, [slug]);

  async function reenable() {
    if (!tour) return;
    setReenableBusy(true);
    try {
      await toggleOrganizerTourStatus(tour.slug, "active");
      await refreshTour();
    } finally {
      setReenableBusy(false);
    }
  }

  if (orgLoading || !organizer) {
    return <div className="mx-auto max-w-5xl px-4 pt-16 text-sm text-ink-secondary">{t("organizer.edit.loading")}</div>;
  }
  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-16">
        <Link to="/organizer" className="text-sm text-blue-deep hover:underline">
          {t("organizer.edit.back")}
        </Link>
        <GlassCard className="p-8 text-center text-ink-secondary">
          {t("organizer.edit.notFound")}
        </GlassCard>
      </div>
    );
  }
  if (!tour) {
    return <div className="mx-auto max-w-5xl px-4 pt-16 text-sm text-ink-secondary">{t("organizer.edit.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-20 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/organizer" className="text-sm text-blue-deep hover:underline">
            {t("organizer.edit.back")}
          </Link>
          <h1 className="font-marker text-4xl leading-[1.1] md:text-5xl">
            {tour.title}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">{tour.country} · {tour.city}</p>
          {tour.status === "active" && (
            <span className="mt-2 inline-block chip chip-blue text-[10px]">
              {t("organizer.status.active")}
            </span>
          )}
        </div>
        <Link to={`/tour/${tour.slug}`} className="chip chip-cream">
          {t("organizer.dashboard.viewPublic")}
        </Link>
      </div>

      <StatusBanner status={tour.status} rejectionReason={tour.rejectionReason} reenable={reenable} reenableBusy={reenableBusy} />

      {bumpToast && (
        <div className="rounded-glass bg-blue-soft/60 px-4 py-3 text-sm text-blue-deep">
          {t("organizer.edit.bumpedToast")}
        </div>
      )}

      <SectionNav />

      <BasicsSection tour={tour} onSaved={refreshTour} />
      <PricingSection tour={tour} onSaved={refreshTour} />
      <DeparturesSection tour={tour} onSaved={refreshTour} />
      <PhotosSection tour={tour} onChanged={refreshTour} />
      <ProgramSection tour={tour} onSaved={refreshTour} />
      <ListsSection tour={tour} onSaved={refreshTour} />
    </div>
  );
}

function SectionNav() {
  const { t } = useI18n();
  const label: Record<SectionId, string> = {
    basics: t("organizer.edit.basics"),
    pricing: t("organizer.edit.pricing"),
    departures: t("organizer.edit.departures"),
    photos: t("organizer.edit.photos"),
    program: t("organizer.edit.program"),
    lists: t("organizer.edit.lists"),
  };
  return (
    <nav className="sticky top-24 z-10 -mx-1 flex flex-wrap gap-2 rounded-pill bg-cream/60 p-1 backdrop-blur">
      {SECTIONS.map((id) => (
        <a key={id} href={`#sec-${id}`} className="chip chip-cream hover:bg-white">
          {label[id]}
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
//  Section: Basics
// ---------------------------------------------------------------------------
function BasicsSection({ tour, onSaved }: { tour: OrganizerTourEditable; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(tour.title);
  const [shortDescription, setShortDescription] = useState(tour.shortDescription);
  const [description, setDescription] = useState(tour.description);
  const [themes, setThemes] = useState<Theme[]>(tour.themes);
  const [durationNights, setDurationNights] = useState(tour.durationNights);
  const [hotelStars, setHotelStars] = useState(tour.hotelStars);
  const [meal, setMeal] = useState(tour.meal);

  // Reset local form whenever the tour is refreshed from the server.
  useEffect(() => {
    setTitle(tour.title);
    setShortDescription(tour.shortDescription);
    setDescription(tour.description);
    setThemes(tour.themes);
    setDurationNights(tour.durationNights);
    setHotelStars(tour.hotelStars);
    setMeal(tour.meal);
  }, [tour]);

  const { save, status, busy } = useSectionSave(async () => {
    await patchAndNotify(tour.slug, {
      title: title.trim(),
      shortDescription: shortDescription.trim().slice(0, 280),
      description: description.trim().slice(0, 8000),
      themes,
      durationNights: Number(durationNights),
      hotelStars: Number(hotelStars),
      meal,
    });
    await onSaved();
  });

  function toggleTheme(th: Theme) {
    setThemes((prev) => prev.includes(th) ? prev.filter((x) => x !== th) : [...prev, th]);
  }

  return (
    <SectionShell id="basics" title={t("organizer.edit.basics")} status={status} busy={busy} onSave={save}>
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledInput label={t("organizer.edit.field.title")} value={title} onChange={setTitle} />
        <ReadonlyField label={t("organizer.edit.field.country")} value={tour.country} />
        <ReadonlyField label={t("organizer.edit.field.city")} value={tour.city} />
        <div className="md:col-span-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("organizer.edit.field.shortDescription")}
            </span>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={2}
              maxLength={280}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-sm outline-none focus:bg-white/80"
            />
            <span className="mt-1 block text-xs text-ink-muted">
              {t("organizer.edit.field.shortDescriptionHint")} · {shortDescription.length}/280
            </span>
          </label>
        </div>
        <div className="md:col-span-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("organizer.edit.field.description")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              maxLength={8000}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-sm outline-none focus:bg-white/80"
            />
            <span className="mt-1 block text-xs text-ink-muted">{description.length}/8000</span>
          </label>
        </div>
        <LabeledInput
          label={t("organizer.edit.field.durationNights")}
          type="number"
          value={String(durationNights)}
          onChange={(v) => setDurationNights(Number(v) || 0)}
        />
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("organizer.edit.field.hotelStars")}
          </span>
          <select
            value={hotelStars}
            onChange={(e) => setHotelStars(Number(e.target.value))}
            className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
          >
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("organizer.edit.field.meal")}
          </span>
          <select
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
          >
            {MEAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5">
        <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          {t("organizer.edit.field.themes")}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_THEMES.map((th) => {
            const on = themes.includes(th);
            return (
              <button
                key={th}
                type="button"
                onClick={() => toggleTheme(th)}
                className={cn("chip transition-colors", on ? "bg-blue-primary text-white" : "chip-cream hover:bg-white")}
              >
                {softT(t, "theme", th)}
              </button>
            );
          })}
        </div>
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
//  Section: Pricing
// ---------------------------------------------------------------------------
function PricingSection({ tour, onSaved }: { tour: OrganizerTourEditable; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [price, setPrice] = useState(tour.price);
  const [oldPrice, setOldPrice] = useState<number | null>(tour.oldPrice);

  useEffect(() => {
    setPrice(tour.price);
    setOldPrice(tour.oldPrice);
  }, [tour]);

  const { save, status, busy } = useSectionSave(async () => {
    await patchAndNotify(tour.slug, {
      price: Number(price) || 0,
      oldPrice: oldPrice == null || oldPrice === 0 ? null : Number(oldPrice),
    });
    await onSaved();
  });

  return (
    <SectionShell id="pricing" title={t("organizer.edit.pricing")} status={status} busy={busy} onSave={save}>
      <div className="grid gap-4 md:grid-cols-2">
        <LabeledInput
          label={t("organizer.edit.field.price")}
          type="number"
          value={String(price)}
          onChange={(v) => setPrice(Number(v) || 0)}
        />
        <LabeledInput
          label={t("organizer.edit.field.oldPrice")}
          type="number"
          value={oldPrice == null ? "" : String(oldPrice)}
          onChange={(v) => setOldPrice(v === "" ? null : Number(v) || 0)}
        />
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
//  Section: Departures
// ---------------------------------------------------------------------------
function DeparturesSection({ tour, onSaved }: { tour: OrganizerTourEditable; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [dates, setDates] = useState<string[]>(tour.departures);
  const [pending, setPending] = useState("");

  useEffect(() => { setDates(tour.departures); }, [tour]);

  function add() {
    const v = pending.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (dates.includes(v)) { setPending(""); return; }
    setDates((d) => [...d, v].sort());
    setPending("");
  }
  function remove(d: string) {
    setDates((arr) => arr.filter((x) => x !== d));
  }

  const { save, status, busy } = useSectionSave(async () => {
    await patchAndNotify(tour.slug, { departures: dates });
    await onSaved();
  });

  return (
    <SectionShell id="departures" title={t("organizer.edit.departures")} status={status} busy={busy} onSave={save}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-60">
          <DatePopover value={pending} onChange={setPending} clearable />
        </div>
        <button type="button" onClick={add} className="btn btn-ghost px-3 py-2 text-sm">
          {t("organizer.edit.addDeparture")}
        </button>
      </div>
      <div className="mt-4">
        {dates.length === 0 ? (
          <p className="text-sm text-ink-secondary">{t("organizer.edit.noDepartures")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <span key={d} className="chip chip-cream">
                {d}
                <button
                  type="button"
                  onClick={() => remove(d)}
                  aria-label={t("common.remove")}
                  className="ml-1 grid h-4 w-4 place-items-center rounded-full hover:bg-white"
                >×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
//  Section: Photos (hero + gallery)
// ---------------------------------------------------------------------------
function PhotosSection({ tour, onChanged }: { tour: OrganizerTourEditable; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const heroInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // imageCount counts hero + gallery — the gallery indices are 1..imageCount-1.
  // Cache-busting via the tour's `popularity` isn't appropriate; we add a
  // mtime-ish suffix to image URLs after each refresh by appending the
  // current imageCount to force the browser to re-fetch.
  const galleryUrls = useMemo(() => tourGallery(tour.slug, tour.imageCount), [tour.slug, tour.imageCount]);
  const heroUrl = useMemo(() => tourHero(tour.slug, tour.imageCount), [tour.slug, tour.imageCount]);

  function validate(file: File): string | null {
    const okTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!okTypes.includes(file.type)) return t("organizer.edit.imageError.type");
    if (file.size > 8 * 1024 * 1024) return t("organizer.edit.imageError.size");
    return null;
  }

  async function upload(file: File, kind: "hero" | "gallery") {
    const v = validate(file);
    if (v) { setError(v); return; }
    setError(null);
    setBusy(true);
    try {
      await uploadOrganizerImage(tour.slug, file, kind);
      await onChanged();
    } catch {
      setError(t("organizer.edit.imageError.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteGallery(idx: number) {
    setBusy(true);
    try {
      await deleteOrganizerGalleryImage(tour.slug, idx);
      await onChanged();
    } catch {
      setError(t("organizer.edit.imageError.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard id="sec-photos" variant="strong" className="scroll-mt-32 p-6">
      <h2 className="text-2xl font-extrabold">{t("organizer.edit.photos")}</h2>

      {error && (
        <div className="mt-3 rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
          {error}
        </div>
      )}

      {/* Hero */}
      <div className="mt-5">
        <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
          {t("organizer.edit.hero")}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="h-32 w-48 overflow-hidden rounded-glass bg-cream-2">
            {heroUrl ? (
              <img src={heroUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-xs text-ink-muted">{t("organizer.edit.noHero")}</div>
            )}
          </div>
          <div>
            <input
              ref={heroInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f, "hero");
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => heroInput.current?.click()}
              disabled={busy}
              className="btn btn-primary px-4 py-2 text-sm disabled:opacity-60"
            >
              {busy ? t("organizer.edit.uploadingImage") : t("organizer.edit.uploadHero")}
            </button>
          </div>
        </div>
      </div>

      {/* Gallery */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("organizer.edit.gallery")}
          </div>
          <div>
            <input
              ref={galleryInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f, "gallery");
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => galleryInput.current?.click()}
              disabled={busy}
              className="btn btn-ghost px-3 py-1.5 text-sm disabled:opacity-60"
            >
              {t("organizer.edit.uploadGallery")}
            </button>
          </div>
        </div>
        {galleryUrls.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">{t("organizer.edit.noGallery")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {galleryUrls.map((url, i) => {
              // gallery-1 .. gallery-(imageCount-1) — idx is 1-based.
              const idx = i + 1;
              return (
                <div key={url} className="group relative overflow-hidden rounded-glass bg-cream-2">
                  <img src={url} alt="" className="h-32 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => deleteGallery(idx)}
                    disabled={busy}
                    className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-orange-deep opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-60"
                  >
                    {t("organizer.edit.deleteImage")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
//  Section: Program (day-by-day)
// ---------------------------------------------------------------------------
function ProgramSection({ tour, onSaved }: { tour: OrganizerTourEditable; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [days, setDays] = useState<ProgramDay[]>(tour.program);

  useEffect(() => { setDays(tour.program); }, [tour]);

  function addDay() {
    setDays((arr) => [...arr, { day: arr.length + 1, title: "", text: "" }]);
  }
  function removeDay(i: number) {
    // Renumber so the day numbers stay sequential after a delete.
    setDays((arr) => arr.filter((_, idx) => idx !== i).map((d, idx) => ({ ...d, day: idx + 1 })));
  }
  function patch(i: number, p: Partial<ProgramDay>) {
    setDays((arr) => arr.map((d, idx) => idx === i ? { ...d, ...p } : d));
  }

  const { save, status, busy } = useSectionSave(async () => {
    // Re-number defensively before save so the backend never sees gaps.
    const normalised = days.map((d, idx) => ({ ...d, day: idx + 1 }));
    await patchAndNotify(tour.slug, { program: normalised });
    await onSaved();
  });

  return (
    <SectionShell id="program" title={t("organizer.edit.program")} status={status} busy={busy} onSave={save}>
      <div className="space-y-4">
        {days.map((d, i) => (
          <div key={i} className="rounded-glass bg-white/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip chip-blue">{t("organizer.edit.programDay", { n: i + 1 })}</span>
              <button type="button" onClick={() => removeDay(i)} className="text-xs text-orange-deep hover:underline">
                {t("organizer.edit.removeDay")}
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              <LabeledInput label={t("organizer.edit.programTitle")} value={d.title} onChange={(v) => patch(i, { title: v })} />
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("organizer.edit.programText")}
                </span>
                <textarea
                  value={d.text}
                  onChange={(e) => patch(i, { text: e.target.value })}
                  rows={3}
                  maxLength={1200}
                  className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-sm outline-none focus:bg-white/80"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addDay} className="btn btn-ghost mt-4 px-4 py-2 text-sm">
        + {t("organizer.edit.addDay")}
      </button>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
//  Section: Lists (highlights / included / excluded)
// ---------------------------------------------------------------------------
function ListsSection({ tour, onSaved }: { tour: OrganizerTourEditable; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [highlights, setHighlights] = useState<string[]>(tour.highlights);
  const [included, setIncluded] = useState<string[]>(tour.included);
  const [excluded, setExcluded] = useState<string[]>(tour.excluded);

  useEffect(() => {
    setHighlights(tour.highlights);
    setIncluded(tour.included);
    setExcluded(tour.excluded);
  }, [tour]);

  const { save, status, busy } = useSectionSave(async () => {
    await patchAndNotify(tour.slug, { highlights, included, excluded });
    await onSaved();
  });

  return (
    <SectionShell id="lists" title={t("organizer.edit.lists")} status={status} busy={busy} onSave={save}>
      <div className="grid gap-5 md:grid-cols-3">
        <StringList label={t("organizer.edit.highlights")} items={highlights} setItems={setHighlights} />
        <StringList label={t("organizer.edit.included")} items={included} setItems={setIncluded} />
        <StringList label={t("organizer.edit.excluded")} items={excluded} setItems={setExcluded} />
      </div>
    </SectionShell>
  );
}

function StringList({ label, items, setItems }: { label: string; items: string[]; setItems: (a: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    setItems([...items, v]);
    setDraft("");
  }
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 rounded-pill bg-white/50 px-3 py-1.5 text-sm">
            <span className="flex-1">{it}</span>
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="text-orange-deep hover:underline"
              aria-label={t("organizer.edit.removeItem")}
            >×</button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="flex-1 rounded-pill bg-white/60 px-3 py-1.5 text-sm outline-none focus:bg-white/80"
        />
        <button type="button" onClick={add} className="rounded-pill bg-white/60 px-3 py-1.5 text-sm hover:bg-white">
          {t("organizer.edit.addItem")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Shared helpers
// ---------------------------------------------------------------------------

type SaveStatus = "idle" | "ok" | "err";

/** Encapsulates the boring bits of every section: in-flight flag, post-save
 *  toast, auto-fade timer. Returns a `save()` that swallows errors and
 *  surfaces them through `status` instead. */
function useSectionSave(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");

  async function save() {
    setBusy(true);
    setStatus("idle");
    try {
      await action();
      setStatus("ok");
      // Short flash — long enough to read, short enough to feel snappy.
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("err");
    } finally {
      setBusy(false);
    }
  }

  return { save, busy, status };
}

/**
 * Wrap an `updateOrganizerTour` call. If the backend signals
 * `bumpedToPending`, dispatch a window event so the parent edit page can
 * surface a toast. Keeps each section's save code unchanged.
 */
async function patchAndNotify(
  slug: string,
  patch: Parameters<typeof updateOrganizerTour>[1],
) {
  const res = await updateOrganizerTour(slug, patch);
  if (res?.bumpedToPending) {
    window.dispatchEvent(new CustomEvent("svitgo:tour-bumped", { detail: { slug } }));
  }
  return res;
}

function StatusBanner({
  status,
  rejectionReason,
  reenable,
  reenableBusy,
}: {
  status: OrganizerTourEditable["status"];
  rejectionReason: string | null;
  reenable: () => Promise<void>;
  reenableBusy: boolean;
}) {
  const { t } = useI18n();
  if (status === "active") return null;
  if (status === "pending") {
    return (
      <div className="rounded-glass bg-blue-soft/60 px-4 py-3 text-sm text-blue-deep">
        {t("organizer.statusBanner.pending")}
      </div>
    );
  }
  if (status === "disabled") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
        <span>{t("organizer.statusBanner.disabled")}</span>
        <button
          type="button"
          onClick={reenable}
          disabled={reenableBusy}
          className="btn btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
        >
          {reenableBusy ? t("organizer.statusBanner.enabling") : t("organizer.actions.enable")}
        </button>
      </div>
    );
  }
  // rejected
  return (
    <div className="rounded-glass border border-orange-soft bg-white/70 p-4 text-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-orange-deep">
        {t("organizer.statusBanner.rejectedTitle")}
      </div>
      {rejectionReason && (
        <p className="mt-1 whitespace-pre-line text-ink-primary">{rejectionReason}</p>
      )}
      <p className="mt-2 text-ink-secondary">{t("organizer.statusBanner.rejectedHint")}</p>
    </div>
  );
}

function SectionShell({
  id,
  title,
  children,
  onSave,
  busy,
  status,
}: {
  id: SectionId;
  title: string;
  children: React.ReactNode;
  onSave: () => void;
  busy: boolean;
  status: SaveStatus;
}) {
  const { t } = useI18n();
  return (
    <GlassCard id={`sec-${id}`} variant="strong" className="scroll-mt-32 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        {status === "ok" && <span className="chip chip-blue">{t("organizer.edit.saved")}</span>}
        {status === "err" && <span className="chip chip-orange">{t("organizer.edit.saveError")}</span>}
      </div>
      <div className="mt-4">{children}</div>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="btn btn-primary disabled:opacity-60"
        >
          {busy ? t("organizer.edit.saving") : t("organizer.edit.save")}
        </button>
      </div>
    </GlassCard>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
      />
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      <div className="mt-2 rounded-pill bg-cream-2 px-4 py-2 text-sm text-ink-secondary">
        {value}
      </div>
      <span className="mt-1 block text-xs text-ink-muted">{t("organizer.edit.field.readonlyHint")}</span>
    </label>
  );
}
