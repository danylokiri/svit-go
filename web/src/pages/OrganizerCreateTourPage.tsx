import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import GlassCard from "@/components/GlassCard";
import { useOrganizerAuth } from "@/auth/OrganizerContext";
import { softT, useI18n } from "@/lib/i18n";
import { createOrganizerTour } from "@/api";

const MEAL_OPTIONS = ["Breakfast", "Half board", "Full board", "All inclusive", "No meals", "Self-catering"];

export default function OrganizerCreateTourPage() {
  const { organizer, loading } = useOrganizerAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [price, setPrice] = useState<string>("");
  const [durationNights, setDurationNights] = useState<string>("7");
  const [hotelStars, setHotelStars] = useState<number>(4);
  const [meal, setMeal] = useState<string>(MEAL_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !organizer) navigate("/organizer/login", { replace: true });
  }, [loading, organizer, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { slug } = await createOrganizerTour({
        title: title.trim(),
        country: country.trim(),
        city: city.trim(),
        price: Number(price) || 0,
        durationNights: Number(durationNights) || undefined,
        hotelStars: Number(hotelStars) || undefined,
        meal,
      });
      navigate(`/organizer/tours/${slug}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !organizer) {
    return <div className="mx-auto max-w-3xl px-4 pt-16 text-sm text-ink-secondary">{t("organizer.edit.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-20 pb-16">
      <Link to="/organizer" className="text-sm text-blue-deep hover:underline">
        {t("organizer.edit.back")}
      </Link>

      <header>
        <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">{t("organizer.create.title")}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("organizer.create.subtitle")}</p>
      </header>

      <GlassCard className="border border-blue-soft/50 bg-blue-soft/30 p-4 text-sm text-ink-primary">
        {t("organizer.create.note")}
      </GlassCard>

      <GlassCard variant="strong" className="p-6">
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <Field label={t("organizer.create.field.title")} span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            />
          </Field>
          <Field label={t("organizer.create.field.country")}>
            <input
              required
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={60}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            />
          </Field>
          <Field label={t("organizer.create.field.city")}>
            <input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            />
          </Field>
          <Field label={t("organizer.create.field.price")}>
            <input
              required
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            />
          </Field>
          <Field label={t("organizer.create.field.durationNights")}>
            <input
              type="number"
              min={1}
              max={60}
              value={durationNights}
              onChange={(e) => setDurationNights(e.target.value)}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            />
          </Field>
          <Field label={t("organizer.create.field.hotelStars")}>
            <select
              value={hotelStars}
              onChange={(e) => setHotelStars(Number(e.target.value))}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            >
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★</option>)}
            </select>
          </Field>
          <Field label={t("organizer.create.field.meal")} span>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="mt-2 w-full rounded-pill bg-white/60 px-4 py-2 text-sm outline-none focus:bg-white/80"
            >
              {MEAL_OPTIONS.map((m) => <option key={m} value={m}>{softT(t, "meal", m)}</option>)}
            </select>
          </Field>

          {err && (
            <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep md:col-span-2">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 md:col-span-2">
            <Link to="/organizer" className="btn btn-ghost px-4 py-2 text-sm">
              {t("admin.dashboard.cancel")}
            </Link>
            <button type="submit" disabled={busy} className="btn btn-primary px-4 py-2 text-sm disabled:opacity-60">
              {busy ? t("organizer.create.creating") : t("organizer.create.submit")}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <label className={span ? "block md:col-span-2" : "block"}>
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
