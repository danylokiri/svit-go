import { Router } from "express";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";
import { convertFromEUR, getRates, isSupportedCurrency, type CurrencyCode } from "../lib/currency.js";

export const bookingsRouter = Router();

// Passenger type is informational only — it's recorded on the booking so the
// organiser can plan room layouts / age-appropriate activities, but every
// traveller pays the full base price. We deliberately kept the type field
// so the data is still captured if we decide to add discounts later.
const TRAVELER_TYPES = ["adult", "child", "senior"] as const;

const travelerSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  dob: z.string().optional(),
  passport: z.string().optional(),
  type: z.enum(TRAVELER_TYPES).optional().default("adult"),
});

// Allow-list of add-ons. Kept in sync with the catalogue card and the
// pricing dict below — if you add an entry here, also wire its price.
const ADD_ON_IDS = ["insurance", "transfer", "room-upgrade"] as const;
type AddOnId = (typeof ADD_ON_IDS)[number];

const createSchema = z.object({
  tourSlug: z.string(),
  travelers: z.array(travelerSchema).min(1).max(8),
  contact: z.object({ email: z.string().email(), phone: z.string().min(5).max(40) }),
  addOns: z.array(z.enum(ADD_ON_IDS)).optional().default([]),
  // YYYY-MM-DD; the client validates "at least 7 days from now" — we just
  // sanity-check the format here so a junk string can't poison the DB.
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Optional free-form note from the traveller (dietary preferences, mobility
  // needs, anniversaries, etc.). Visible only to the organizer.
  specialRequest: z.string().max(2000).optional(),
  // Display currency the user saw on the checkout page. Stored alongside the
  // EUR totalPrice so we can show "you paid 4500 UAH" in their history even
  // if rates change later.
  currency: z.string().max(8).optional(),
});

bookingsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await prisma.booking.findMany({
    where: { userId: req.userId! },
    include: { tour: true, review: true },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
  res.json(rows.map(serializeBooking));
});

bookingsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Idempotency-Key: client sends a fresh UUID per "intent to book" and
  // includes the same one in any retry. If we've already created a booking
  // with that key (double-click, network retry), return the existing row
  // instead of duplicating.
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (idempotencyKey) {
    const existing = await prisma.booking.findUnique({
      where: { idempotencyKey },
      include: { tour: true, review: true },
    });
    if (existing) {
      if (existing.userId !== req.userId!) {
        // Reused key from a different user — refuse rather than expose.
        res.status(409).json({ error: "idempotency key already used" });
        return;
      }
      res.status(200).json(serializeBooking(existing));
      return;
    }
  }

  const {
    tourSlug,
    travelers,
    contact,
    addOns,
    startDate: startDateRaw,
    specialRequest,
    currency: currencyRaw,
  } = parsed.data;
  const tour = await prisma.tour.findUnique({ where: { slug: tourSlug } });
  if (!tour) {
    res.status(404).json({ error: "tour not found" });
    return;
  }

  const addOnPrices: Record<AddOnId, number> = {
    insurance: 45,
    transfer: 30,
    "room-upgrade": 120,
  };
  // Dedupe — adding the same add-on twice is meaningless (you can't have two
  // transfers for one booking) and would double-charge the user otherwise.
  const uniqueAddOns = Array.from(new Set(addOns));
  const extras = uniqueAddOns.reduce((sum, a) => sum + addOnPrices[a], 0);
  const totalPrice = tour.price * travelers.length + extras;

  // Display currency: validate against supported list, default to EUR.
  const currency: CurrencyCode = currencyRaw && isSupportedCurrency(currencyRaw) ? currencyRaw : "EUR";
  const rates = await getRates();
  const totalInCurrency = convertFromEUR(totalPrice, currency, rates);

  // If the organiser set a fixed `departures` allow-list, the booked
  // startDate MUST match one of them — otherwise a hand-crafted POST could
  // bypass the client-side <select> and create a booking on a date the
  // organiser never planned to run (they'd see an unrecognised date on
  // OrganizerBookingsPage). Tours with empty departures stay flexible.
  const allowedDepartures = json.parse<string[]>(tour.departures, []);
  if (allowedDepartures.length > 0 && startDateRaw && !allowedDepartures.includes(startDateRaw)) {
    res.status(400).json({
      error: "startDate must match one of the tour's published departures",
      allowedDepartures,
    });
    return;
  }

  // Use the user-picked date if it parses to a real future date; otherwise
  // fall back to 4 weeks from now so the field is never empty in the DB.
  let startDate = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
  if (startDateRaw) {
    const parsedDate = new Date(startDateRaw + "T12:00:00Z");
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate > new Date()) {
      startDate = parsedDate;
    }
  }

  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        userId: req.userId!,
        tourId: tour.id,
        travelers: JSON.stringify(travelers),
        contact: JSON.stringify(contact),
        addOns: JSON.stringify(uniqueAddOns),
        totalPrice,
        currency,
        totalInCurrency,
        specialRequest: specialRequest?.trim() || null,
        status: "confirmed",
        startDate,
        idempotencyKey,
      },
      include: { tour: true, review: true },
    });
  } catch (e) {
    // P2002 = unique constraint hit. Race: another request with the same
    // idempotency key got committed first. Re-fetch and return it.
    if ((e as { code?: string }).code === "P2002" && idempotencyKey) {
      const existing = await prisma.booking.findUnique({
        where: { idempotencyKey },
        include: { tour: true, review: true },
      });
      if (existing) {
        res.status(200).json(serializeBooking(existing));
        return;
      }
    }
    throw e;
  }

  res.status(201).json(serializeBooking(booking));
});

function serializeBooking(
  b: Awaited<ReturnType<typeof prisma.booking.findFirstOrThrow>> & {
    tour: Awaited<ReturnType<typeof prisma.tour.findFirstOrThrow>>;
    review?: Awaited<ReturnType<typeof prisma.review.findFirstOrThrow>> | null;
  }
) {
  const startDate = b.startDate;
  const isPast = startDate ? startDate < new Date() : false;
  return {
    id: b.id,
    tourSlug: b.tour.slug,
    tour: {
      slug: b.tour.slug,
      country: b.tour.country,
      city: b.tour.city,
      title: b.tour.title,
      emoji: b.tour.emoji,
      gradient: b.tour.gradient,
      meal: b.tour.meal,
      imageCount: b.tour.imageCount,
    },
    travelers: json.parse<unknown[]>(b.travelers, []),
    contact: json.parse<unknown>(b.contact, {}),
    addOns: json.parse<string[]>(b.addOns, []),
    totalPrice: b.totalPrice,           // always EUR (base)
    currency: b.currency,                // display currency at booking time
    totalInCurrency: b.totalInCurrency,  // snapshotted converted amount
    specialRequest: b.specialRequest ?? null,
    status: b.status,
    startDate: startDate ? startDate.toISOString() : null,
    isPast,
    hasReview: !!b.review,
    createdAt: b.createdAt.toISOString(),
  };
}
