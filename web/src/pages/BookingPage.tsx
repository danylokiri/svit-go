import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, Plus, Trash2 } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { cn, formatDate } from "@/lib/utils";
import { Money } from "@/components/Money";
import DatePopover from "@/components/DatePopover";
import {
  createBooking,
  fetchTour,
  newIdempotencyKey,
  type Tour,
  type Traveler,
  type TravelerType,
} from "@/api";
import { showToast } from "@/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import { useCurrency, convertFromEUR } from "@/contexts/CurrencyContext";
import { useI18n } from "@/lib/i18n";

// Stable step IDs (used for state). Display labels resolved via i18n.
const stepIds = ["travelers", "contacts", "payment", "done"] as const;

interface TravelerDraft {
  firstName: string;
  lastName: string;
  dob: string;
  passport: string;
  type: TravelerType;
}

interface ContactState {
  email: string;
  phone: string;
}
interface CardState {
  card: string;
  holder: string;
  expiry: string;
  cvc: string;
}

/** YYYY-MM-DD for today + N days. Used for date picker bounds. */
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const ADD_ON_PRICES: Record<string, number> = {
  insurance: 45,
  transfer: 30,
  "room-upgrade": 120,
};
const ADD_ON_KEYS: Record<string, "booking.addOns.insurance" | "booking.addOns.transfer" | "booking.addOns.roomUpgrade"> = {
  insurance: "booking.addOns.insurance",
  transfer: "booking.addOns.transfer",
  "room-upgrade": "booking.addOns.roomUpgrade",
};

function emptyTraveler(type: TravelerType): TravelerDraft {
  return { firstName: "", lastName: "", dob: "", passport: "", type };
}

/**
 * Auto-classify a passenger by age:
 *   under 14   → child
 *   14..64     → adult
 *   65 and up  → senior
 * Returns `null` when the DOB string is empty or unparseable — we keep the
 * internal type as-is in that case so the data we send to the server is
 * always a valid enum value, but the UI shows no chip until age is known.
 */
function travelerTypeFromDob(dob: string): TravelerType | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const birth = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  // Birthday hasn't happened yet this year → subtract one.
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 0) return null; // future date — treat as unknown
  if (age < 14) return "child";
  if (age >= 65) return "senior";
  return "adult";
}

/**
 * Total passenger count from URL. TourPage hands off a simple `?passengers=N`
 * (we used to take adult/child/senior triplets, but pricing is uniform now —
 * the type only matters for the per-card selector in this page).
 */
function passengerCountFromParams(params: URLSearchParams): number {
  const n = Number(params.get("passengers"));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(n)));
}

/**
 * Card-number auto-mask: strip non-digits, cap at 16 digits, group in
 * blocks of four with single spaces. Result for "4242424242424242" is
 * "4242 4242 4242 4242" — matches what users see on physical cards and
 * what every modern payment widget does (Stripe, Apple Pay).
 *
 * Pilot user testing (May 2026) showed every participant who reached
 * the payment step expected the separators to appear automatically;
 * Olexandr's verdict was the most explicit: "I have to insert the
 * slash myself? That's uncomfortable, this needs to be optimised."
 */
function maskCardNumber(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * Expiry auto-mask: strip non-digits, cap at 4, auto-insert "/" after
 * the second digit (MM/YY). Display "12/29" for "1229". The companion
 * regex validator in `validate()` (line ~235) keeps accepting both
 * "MM/YY" and "MM / YY" so old values still pass.
 */
function maskExpiry(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function BookingPage() {
  const [params] = useSearchParams();
  const tourSlug = params.get("tour");
  // ?startDate=... handoff from TourPage's departure picker. We prefill the
  // form so the user lands on Booking with their pick already selected.
  const startDateParam = params.get("startDate");
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { currency, rates } = useCurrency();
  const navigate = useNavigate();
  const stepLabels: Record<typeof stepIds[number], string> = {
    travelers: t("booking.step.travelers"),
    contacts: t("booking.step.contacts"),
    payment: t("booking.step.payment"),
    done: t("booking.step.done"),
  };

  const [tour, setTour] = useState<Tour | null>(null);
  // Dev-only: ?step=N URL param jumps to a specific step for screenshots.
  // In production this is a no-op (env DEV gate).
  const initialStep = (() => {
    if (!import.meta.env.DEV) return 0;
    const s = parseInt(new URLSearchParams(window.location.search).get("step") || "0", 10);
    return Number.isFinite(s) && s >= 0 && s <= 3 ? s : 0;
  })();
  const [step, setStep] = useState(initialStep);
  // Previous step — drives the one-shot blue glow on the indicator. When
  // step advances (or goes back) we re-key the active circle so the CSS
  // animation re-fires. NOTE: comparing against this prev value also lets
  // us avoid glowing on initial mount when no real navigation happened.
  const [prevStep, setPrevStep] = useState(0);
  useEffect(() => {
    if (step !== prevStep) {
      const id = window.setTimeout(() => setPrevStep(step), 800);
      return () => window.clearTimeout(id);
    }
  }, [step, prevStep]);
  const [busy, setBusy] = useState(false);
  const [confirmedTotal, setConfirmedTotal] = useState<number | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey());

  // Seed N adults from the URL count (defaulting to 1). The type defaults to
  // "adult" — each card has its own selector so the user changes it per
  // passenger as needed.
  const [travelers, setTravelers] = useState<TravelerDraft[]>(() => {
    const n = passengerCountFromParams(params);
    return Array.from({ length: n }, () => emptyTraveler("adult"));
  });

  const [startDate, setStartDate] = useState<string>(startDateParam || dateOffset(28));
  const [contact, setContact] = useState<ContactState>({ email: "", phone: "" });
  const [card, setCard] = useState<CardState>({ card: "", holder: "", expiry: "", cvc: "" });
  const [addOns, setAddOns] = useState<string[]>([]);
  const [specialRequest, setSpecialRequest] = useState("");

  // Errors keyed by `traveler-${index}-${field}` or by top-level keys
  // ("startDate", "email", "phone", "card", "holder", "expiry", "cvc").
  const [errors, setErrors] = useState<Record<string, string>>({});

  function clearErr(key: string) {
    if (errors[key]) setErrors((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }

  function updateTraveler(i: number, patch: Partial<TravelerDraft>) {
    setTravelers((p) =>
      p.map((tr, idx) => {
        if (idx !== i) return tr;
        const next = { ...tr, ...patch };
        // Auto-classify by DOB whenever it changes. Falls back to "adult"
        // when the field is cleared so the type we send to the server is
        // always a valid enum value — the UI just hides the chip until a
        // real DOB is in.
        if (Object.prototype.hasOwnProperty.call(patch, "dob")) {
          const detected = travelerTypeFromDob(next.dob);
          next.type = detected ?? "adult";
        }
        return next;
      }),
    );
    for (const k of Object.keys(patch)) clearErr(`traveler-${i}-${k}`);
  }
  function addTraveler() {
    if (travelers.length >= 8) return;
    setTravelers((p) => [...p, emptyTraveler("adult")]);
  }
  function removeTraveler(i: number) {
    if (travelers.length <= 1) return;
    setTravelers((p) => p.filter((_, idx) => idx !== i));
    // Strip stale errors that referenced this traveler — otherwise removing
    // a passenger with red fields leaves orphan error keys in state.
    setErrors((p) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(p)) {
        if (!k.startsWith(`traveler-${i}-`)) next[k] = v;
      }
      return next;
    });
  }

  function validateStep(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    const REQ = t("booking.field.required");
    const TOO_SHORT = t("booking.field.tooShort");
    if (s === 0) {
      travelers.forEach((tr, i) => {
        if (!tr.firstName.trim()) e[`traveler-${i}-firstName`] = REQ;
        if (!tr.lastName.trim())  e[`traveler-${i}-lastName`]  = REQ;
        // Lead passenger (index 0) is the booking's contact-of-record — they
        // need to be of age. If the DOB we got classifies them as a child,
        // block the step and flag the DOB field. Children can travel; they
        // just can't be the booking's primary holder.
        if (i === 0 && travelerTypeFromDob(tr.dob) === "child") {
          e[`traveler-0-dob`] = t("booking.field.leadMustBeAdult");
        }
      });
      if (!startDate)                       e.startDate = t("booking.field.pickDate");
      else if (startDate < dateOffset(7))   e.startDate = t("booking.field.weekOut");
    } else if (s === 1) {
      if (!contact.email.trim())             e.email = REQ;
      else if (!isValidEmail(contact.email)) e.email = t("booking.field.invalidEmail");
      if (!contact.phone.trim())             e.phone = REQ;
      else if (contact.phone.replace(/\D/g, "").length < 7) e.phone = TOO_SHORT;
    } else if (s === 2) {
      const digits = card.card.replace(/\s/g, "");
      if (!digits)                                e.card = REQ;
      else if (!/^\d{13,19}$/.test(digits))       e.card = t("booking.field.cardDigits");
      if (!card.holder.trim())                    e.holder = REQ;
      else if (card.holder.trim().length < 2)     e.holder = TOO_SHORT;
      if (!card.expiry.trim())                    e.expiry = REQ;
      else if (!/^\d{2}\s*\/\s*\d{2}$/.test(card.expiry)) e.expiry = t("booking.field.mmYy");
      if (!card.cvc.trim())                       e.cvc = REQ;
      else if (!/^\d{3,4}$/.test(card.cvc))       e.cvc = t("booking.field.cvcDigits");
    }
    return e;
  }

  useEffect(() => {
    if (!tourSlug) return;
    fetchTour(tourSlug).then(setTour).catch(console.error);
  }, [tourSlug]);

  useEffect(() => {
    if (!tour) return;
    if (tour.departures.length === 0) return;
    if (!tour.departures.includes(startDate)) {
      setStartDate(tour.departures[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour]);

  useEffect(() => {
    if (user?.email && !contact.email) setContact((p) => ({ ...p, email: user.email }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Live total preview — matches the server's pricing (uniform per-pax price
  // + add-ons). If we ever bring back type-based discounts, sum here using
  // the same multiplier table as routes/bookings.ts.
  const { travelersTotal, addOnsTotal, total } = useMemo(() => {
    if (!tour) return { travelersTotal: 0, addOnsTotal: 0, total: 0 };
    const travelersTotal = tour.price * travelers.length;
    const addOnsTotal = addOns.reduce((s, a) => s + (ADD_ON_PRICES[a] ?? 0), 0);
    return { travelersTotal, addOnsTotal, total: travelersTotal + addOnsTotal };
  }, [tour, travelers, addOns]);

  async function submit() {
    if (!tour) return;
    if (!user) {
      navigate("/auth", { state: { from: `/booking?tour=${tour.id}` } });
      return;
    }
    setBusy(true);
    try {
      const payloadTravelers: Traveler[] = travelers.map((tr) => ({
        firstName: tr.firstName.trim(),
        lastName:  tr.lastName.trim(),
        dob:       tr.dob      || undefined,
        passport:  tr.passport || undefined,
        type:      tr.type,
      }));
      await createBooking({
        tourSlug: tour.id,
        travelers: payloadTravelers,
        contact: { email: contact.email.trim(), phone: contact.phone.trim() },
        addOns,
        startDate: startDate || undefined,
        specialRequest: specialRequest.trim() || undefined,
        currency,
        idempotencyKey,
      });
      setConfirmedTotal(total);
      setStep(3);
      setTimeout(() => navigate("/account?tab=bookings"), 1500);
    } catch (e) {
      console.error("booking failed:", e);
      showToast(t("booking.errorRetry"), "warn");
    } finally {
      setBusy(false);
    }
  }

  if (tourSlug && !tour) {
    return (
      <div className="mx-auto max-w-4xl px-4 pt-16 text-sm text-ink-secondary">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pt-16">
      <h1 className="font-marker text-6xl leading-none md:text-7xl">{t("booking.title")}</h1>
      {tour && (
        <p className="mt-3 text-ink-secondary">
          {tour.country} · {tour.city} — {tour.title}
        </p>
      )}
      {!tour && (
        <p className="mt-3 text-ink-secondary">
          {t("booking.pickTour")}
        </p>
      )}

      {/* Stepper */}
      <ol className="mt-8 flex items-center gap-2 text-sm">
        {stepIds.map((id, i) => (
          <li key={id} className="flex flex-1 items-center gap-2">
            <span
              // Re-key the active circle each time step changes so the CSS
              // `stepGlow` animation re-fires. Without the key React reuses
              // the element and `animation` stays "already played".
              key={i === step ? `active-${step}` : `step-${i}`}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full text-xs font-bold",
                i < step
                  ? "bg-blue-primary text-white"
                  : i === step
                    ? "bg-orange-accent text-white"
                    : "bg-white/60 text-ink-muted",
                i === step && step !== prevStep && "step-glow",
              )}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden font-semibold md:inline",
                i === step ? "text-ink-primary" : "text-ink-secondary"
              )}
            >
              {stepLabels[id]}
            </span>
            {i < stepIds.length - 1 && (
              <span className="mx-2 h-px flex-1 bg-white/50" />
            )}
          </li>
        ))}
      </ol>

      {tour ? (
        <GlassCard variant="strong" className="mt-8 p-8">
          {step === 0 && (
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{t("booking.passengers.title")}</h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {t("booking.passengers.subtitle")}
                  </p>
                </div>
                <div className="text-xs text-ink-secondary">
                  {t("booking.passengers.count", { n: String(travelers.length), max: "8" })}
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {travelers.map((tr, i) => (
                  <TravelerCard
                    key={i}
                    index={i}
                    traveler={tr}
                    onChange={(patch) => updateTraveler(i, patch)}
                    onRemove={travelers.length > 1 ? () => removeTraveler(i) : null}
                    errors={errors}
                    primary={i === 0}
                  />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <AddPassengerButton
                  label={t("booking.passengers.add")}
                  onClick={() => addTraveler()}
                  disabled={travelers.length >= 8}
                />
              </div>

              <div className="mt-8">
                <h3 className="text-lg font-bold">{t("booking.trip.title")}</h3>
                <p className="mt-1 text-sm text-ink-secondary">
                  {t("booking.trip.subtitle")}
                </p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {tour.departures.length > 0 ? (
                    <SelectField
                      label={t("booking.trip.departure")}
                      required
                      value={startDate}
                      error={errors.startDate}
                      onChange={(v) => { setStartDate(v); clearErr("startDate"); }}
                      options={tour.departures.map((iso) => ({
                        value: iso,
                        label: formatDate(iso, locale),
                      }))}
                    />
                  ) : (
                    <DateLabel
                      label={t("booking.trip.departure")}
                      required
                      error={errors.startDate}
                    >
                      <DatePopover
                        value={startDate}
                        onChange={(v) => { setStartDate(v); clearErr("startDate"); }}
                        min={dateOffset(7)}
                        max={dateOffset(365)}
                      />
                    </DateLabel>
                  )}
                  <div className="rounded-glass-md bg-white/40 p-4 text-sm text-ink-secondary">
                    <div className="font-bold text-ink-primary">
                      {t("booking.trip.nightsReturn", {
                        n: tour.durationNights,
                        date: startDate
                          ? formatDate(
                              new Date(new Date(startDate).getTime() + tour.durationNights * 86_400_000),
                              locale,
                            )
                          : "—",
                      })}
                    </div>
                    <div className="mt-1">
                      {t("booking.trip.confirmNote")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold">{t("booking.contact.title")}</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label={t("booking.contact.email")} required type="email" value={contact.email} error={errors.email} onChange={(v) => { setContact((p) => ({ ...p, email: v })); clearErr("email"); }} placeholder="you@example.com" />
                <Field label={t("booking.contact.phone")} required value={contact.phone} error={errors.phone} onChange={(v) => { setContact((p) => ({ ...p, phone: v })); clearErr("phone"); }} placeholder="+380 ..." />
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-bold">{t("booking.addOns.title")}</h3>
                <div className="mt-3 space-y-2 text-sm">
                  {Object.keys(ADD_ON_KEYS).map((id) => (
                    <label key={id} className="flex cursor-pointer items-center gap-3 rounded-glass-md bg-white/40 px-4 py-3 hover:bg-white/60">
                      <input
                        type="checkbox"
                        checked={addOns.includes(id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...addOns, id]
                            : addOns.filter((a) => a !== id);
                          setAddOns(next);
                        }}
                        className="h-4 w-4 accent-blue-primary"
                      />
                      {t(ADD_ON_KEYS[id])}
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-6">
                <label className="block">
                  <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {t("booking.specialRequest.label")}
                  </span>
                  <textarea
                    value={specialRequest}
                    onChange={(e) =>
                      setSpecialRequest(e.target.value.slice(0, 2000))
                    }
                    placeholder={t("booking.specialRequest.placeholder")}
                    rows={4}
                    maxLength={2000}
                    className="mt-2 w-full resize-y rounded-glass-md bg-white/60 px-4 py-3 text-base outline-none placeholder:text-ink-muted focus:bg-white/80"
                  />
                  <span className="mt-1 block text-right text-[11px] text-ink-muted">
                    {specialRequest.length} / 2000
                  </span>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold">{t("booking.payment.title")}</h2>
              <div className="mt-6 rounded-glass-md bg-white/50 p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("booking.payment.passengers")}
                </div>
                {/* Group identical passenger types so the receipt reads
                    "2 × Adults — €1160", not eight separate rows. Pricing is
                    uniform across types, but we still show the breakdown so
                    the organiser sees the mix at a glance. */}
                {(["adult", "child", "senior"] as const).map((type) => {
                  const count = travelers.filter((tr) => tr.type === type).length;
                  if (count === 0) return null;
                  return (
                    <div key={type} className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">
                        {count} × {t(`booking.passenger.type.${type}` as const)}
                      </span>
                      <span className="font-semibold">
                        <Money eur={tour.price * count} />
                      </span>
                    </div>
                  );
                })}
                {addOns.map((a) => (
                  <div key={a} className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{t(ADD_ON_KEYS[a]).replace(/\s\(.+\)/, "")}</span>
                    <span className="font-semibold"><Money eur={ADD_ON_PRICES[a]} /></span>
                  </div>
                ))}
                <div className="mt-4 flex items-center justify-between border-t border-white/60 pt-4 text-lg font-extrabold">
                  <span>{t("booking.payment.total")}</span>
                  <span><Money eur={total} /></span>
                </div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label={t("booking.payment.card")}   required value={card.card}   error={errors.card}   inputMode="numeric" onChange={(v) => { setCard((p) => ({ ...p, card: maskCardNumber(v) })); clearErr("card"); }}   placeholder="0000 0000 0000 0000" />
                <Field label={t("booking.payment.holder")} required value={card.holder} error={errors.holder} onChange={(v) => { setCard((p) => ({ ...p, holder: v })); clearErr("holder"); }} placeholder="DANYLO KIRIIENKO" />
                <Field label={t("booking.payment.expiry")} required value={card.expiry} error={errors.expiry} inputMode="numeric" onChange={(v) => { setCard((p) => ({ ...p, expiry: maskExpiry(v) })); clearErr("expiry"); }} placeholder="MM/YY" />
                <Field label={t("booking.payment.cvc")}    required value={card.cvc}    error={errors.cvc}    inputMode="numeric" onChange={(v) => { setCard((p) => ({ ...p, cvc: v.replace(/\D/g, "").slice(0, 4) })); clearErr("cvc"); }}    placeholder="•••" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="py-8 text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-blue-primary text-white shadow-glass">
                <Check size={36} />
              </div>
              <h2 className="mt-6 text-3xl font-extrabold">{t("booking.done.title")}</h2>
              <p className="mt-2 text-ink-secondary">
                {t("booking.done.subtitle", {
                  total: "{TOTAL}",
                  email: contact.email || user?.email || "—",
                }).split("{TOTAL}").map((chunk, i, all) => (
                  <span key={i}>
                    {chunk}
                    {i < all.length - 1 && (
                      <Money
                        eur={confirmedTotal ?? total}
                        forceCurrency={currency}
                        forceAmount={convertFromEUR(confirmedTotal ?? total, rates, currency)}
                        className="font-semibold text-ink-primary"
                      />
                    )}
                  </span>
                ))}
              </p>
              <button
                onClick={() => navigate("/account?tab=bookings")}
                className="btn btn-primary mt-8"
              >
                {t("booking.done.cta")}
              </button>
            </div>
          )}

          {/* Live running total — visible on steps 0 and 1 so the user knows
              how their passenger mix affects price BEFORE they reach payment. */}
          {step < 2 && tour && (
            <div className="mt-8 flex items-center justify-between rounded-glass-md bg-white/50 px-4 py-3 text-sm">
              <span className="text-ink-secondary">
                {t("booking.totalPreview")}
                <span className="ml-2 text-xs text-ink-muted">
                  {t("booking.passengers.count", { n: String(travelers.length), max: "8" })}
                  {addOnsTotal > 0 && <> · {t("booking.addOns.short")}</>}
                </span>
              </span>
              <div className="text-right">
                <div className="text-lg font-extrabold"><Money eur={total} /></div>
                {travelersTotal !== total && (
                  <div className="text-[10px] text-ink-muted">
                    {t("booking.totalBreakdown", {
                      pax: `€${travelersTotal}`,
                      extras: `€${addOnsTotal}`,
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step < 3 && (
            <div className="mt-8 flex justify-between">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="btn btn-ghost disabled:opacity-50"
              >
                {t("booking.cta.back")}
              </button>
              <button
                onClick={() => {
                  const e = validateStep(step);
                  if (Object.keys(e).length > 0) {
                    setErrors(e);
                    return;
                  }
                  setErrors({});
                  if (step === 2) submit();
                  else setStep((s) => s + 1);
                }}
                disabled={busy}
                className="btn btn-primary disabled:opacity-60"
              >
                {busy ? "..." : step === 2 ? t("booking.cta.pay") : t("booking.cta.next")}
              </button>
            </div>
          )}
        </GlassCard>
      ) : (
        <GlassCard className="mt-8 p-10 text-center">
          <button onClick={() => navigate("/catalog")} className="btn btn-primary">
            {t("booking.browseCatalog")}
          </button>
        </GlassCard>
      )}
    </div>
  );
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ---------------------------------------------------------------------------
//  Traveler card — one passenger's fields. Passenger type (adult / child /
//  senior) is auto-detected from DOB so the user doesn't have to think about
//  it — the organiser needs the categorisation, not the user.
// ---------------------------------------------------------------------------
function TravelerCard({
  index,
  traveler,
  onChange,
  onRemove,
  errors,
  primary,
}: {
  index: number;
  traveler: TravelerDraft;
  onChange: (patch: Partial<TravelerDraft>) => void;
  onRemove: (() => void) | null;
  errors: Record<string, string>;
  primary: boolean;
}) {
  const { t } = useI18n();
  // Show the auto-detected category ONLY when a DOB has been entered.
  // Without DOB the slot is empty — no "Adult" guess, no €X/person clutter.
  const detected = travelerTypeFromDob(traveler.dob);
  return (
    <div className="rounded-glass-md bg-white/45 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-soft/70 text-xs font-bold text-blue-deep">
            {index + 1}
          </span>
          <div>
            <div className="text-sm font-bold text-ink-primary">
              {primary
                ? t("booking.passenger.primaryHeading", { n: String(index + 1) })
                : t("booking.passenger.heading", { n: String(index + 1) })}
            </div>
            {detected && (
              <div className="mt-0.5">
                <span className={cn(
                  "inline-flex rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  detected === "child"  ? "bg-orange-soft/70 text-orange-deep" :
                  detected === "senior" ? "bg-blue-soft/70 text-blue-deep" :
                                          "bg-white/70 text-ink-secondary",
                )}>
                  {t(`booking.passenger.type.${detected}` as const)}
                </span>
              </div>
            )}
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-pill bg-white/60 px-3 py-1.5 text-xs font-semibold text-orange-deep transition-colors hover:bg-orange-soft/60"
          >
            <Trash2 size={12} />
            {t("booking.passenger.remove")}
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field
          label={t("booking.traveler.firstName")}
          required
          value={traveler.firstName}
          error={errors[`traveler-${index}-firstName`]}
          onChange={(v) => onChange({ firstName: v })}
          placeholder="Danylo"
        />
        <Field
          label={t("booking.traveler.lastName")}
          required
          value={traveler.lastName}
          error={errors[`traveler-${index}-lastName`]}
          onChange={(v) => onChange({ lastName: v })}
          placeholder="Kiriienko"
        />
        <DateLabel
          label={t("booking.traveler.dob")}
          error={errors[`traveler-${index}-dob`]}
        >
          <DatePopover
            value={traveler.dob}
            onChange={(v) => onChange({ dob: v })}
            max={new Date().toISOString().slice(0, 10)}
            clearable
          />
        </DateLabel>
        <Field
          label={t("booking.traveler.passport")}
          value={traveler.passport}
          onChange={(v) => onChange({ passport: v })}
          placeholder="FK123456"
        />
      </div>
    </div>
  );
}

function AddPassengerButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-pill bg-white/60 px-3 py-1.5 text-xs font-semibold text-ink-primary transition-colors hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus size={12} />
      {label}
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  error,
  required,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {label}
        {required && <span className="text-orange-accent">*</span>}
        {error && <span className="ml-auto normal-case tracking-normal text-orange-accent">{error}</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={cn(
          "mt-2 w-full rounded-glass-sm bg-white/60 px-4 py-3 text-base outline-none focus:bg-white/80",
          error && "ring-2 ring-orange-accent/70"
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  required,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "required">) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {label}
        {required && <span className="text-orange-accent">*</span>}
        {error && <span className="ml-auto normal-case tracking-normal text-orange-accent">{error}</span>}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={cn(
          "mt-2 w-full rounded-glass-sm bg-white/60 px-4 py-3 text-base outline-none placeholder:text-ink-muted focus:bg-white/80",
          error && "ring-2 ring-orange-accent/70"
        )}
      />
    </label>
  );
}

function DateLabel({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {label}
        {required && <span className="text-orange-accent">*</span>}
        {error && <span className="ml-auto normal-case tracking-normal text-orange-accent">{error}</span>}
      </span>
      <div className={cn("mt-2", error && "rounded-glass-sm ring-2 ring-orange-accent/70")}>
        {children}
      </div>
    </div>
  );
}

