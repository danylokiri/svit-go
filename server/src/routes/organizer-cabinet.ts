/**
 * Organizer cabinet routes — everything the agency/guide can do to manage
 * their own listings.
 *
 *   GET    /api/organizer/tours              — list my tours
 *   PATCH  /api/organizer/tours/:slug        — edit metadata/price/departures
 *   POST   /api/organizer/tours/:slug/hero   — upload hero image
 *   POST   /api/organizer/tours/:slug/gallery — upload a gallery image
 *   DELETE /api/organizer/tours/:slug/gallery/:index — drop a gallery image
 *   PATCH  /api/organizer/profile            — edit own profile
 *
 * Auth: requires an organizer token (Bearer JWT with kind="org"). Every
 * mutation re-checks that the targeted tour belongs to req.organizerId —
 * never trust the path alone.
 *
 * Photos: uploads land in /public/tours/<slug>/ as both .jpg (originals)
 * and .webp (1920w/800w/400w) processed via sharp. Same layout as the
 * one-shot `web/scripts/optimize-images.mjs` produces, so the frontend
 * <TourImage> component picks them up transparently.
 */
import { Router } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest, requireOrganizer } from "../middleware/auth.js";

export const organizerCabinetRouter = Router();

// Photos. In dev they live in the frontend's /public folder so Vite serves
// them directly. In prod the path is overridable via UPLOADS_DIR so a
// Render disk mount (e.g. /opt/render/.../uploads/tours) can hold them
// and Express serves /tours/* statically from there.
const TOUR_IMG_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR, "tours")
  : path.resolve(process.cwd(), "../web/public/tours");

// In-memory upload — sharp processes immediately and writes the resized
// versions. Memory storage is fine because we cap to 8MB.
// fileFilter rejects non-images BEFORE we read the buffer so a malicious
// 8MB binary doesn't get the chance to hit sharp's slow path.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

type OwnTourResult =
  | { error: string; status: number; tour?: undefined }
  | { tour: Awaited<ReturnType<typeof prisma.tour.findFirstOrThrow>>; error?: undefined };

/** Confirms the tour exists AND belongs to the calling organizer. */
async function ownTour(slug: string, organizerId: number): Promise<OwnTourResult> {
  const tour = await prisma.tour.findUnique({ where: { slug } });
  if (!tour) return { error: "tour not found", status: 404 };
  if (tour.organizerId !== organizerId) return { error: "not your tour", status: 403 };
  return { tour };
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

/** Write the hero JPG + three responsive WebPs to disk. */
async function writeHero(slug: string, buf: Buffer) {
  const dir = path.join(TOUR_IMG_ROOT, slug);
  await ensureDir(dir);
  // Original JPG (re-encoded to strip metadata and standardise quality)
  await sharp(buf).jpeg({ quality: 86 }).toFile(path.join(dir, "hero.jpg"));
  await sharp(buf).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, "hero.webp"));
  await sharp(buf).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(dir, "hero.w800.webp"));
  await sharp(buf).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, "hero.w400.webp"));
}

/** Append one gallery image. Returns the new total image count. */
async function appendGallery(slug: string, buf: Buffer, currentCount: number): Promise<number> {
  const dir = path.join(TOUR_IMG_ROOT, slug);
  await ensureDir(dir);
  const nextIdx = currentCount + 1;
  await sharp(buf).jpeg({ quality: 86 }).toFile(path.join(dir, `gallery-${nextIdx}.jpg`));
  await sharp(buf).webp({ quality: 80 }).toFile(path.join(dir, `gallery-${nextIdx}.webp`));
  return nextIdx;
}

// ---------------------------------------------------------------------------
//  Routes
// ---------------------------------------------------------------------------

organizerCabinetRouter.get("/tours", requireOrganizer, async (req: AuthedRequest, res) => {
  const tours = await prisma.tour.findMany({
    where: { organizerId: req.organizerId! },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    tours.map((t) => ({
      slug: t.slug,
      title: t.title,
      country: t.country,
      city: t.city,
      price: t.price,
      oldPrice: t.oldPrice ?? null,
      durationNights: t.durationNights,
      hotelStars: t.hotelStars,
      meal: t.meal,
      imageCount: t.imageCount,
      popularity: t.popularity,
      shortDescription: t.shortDescription,
      description: t.description,
      themes: json.parse<string[]>(t.themes, []),
      highlights: json.parse<string[]>(t.highlights, []),
      included: json.parse<string[]>(t.included, []),
      excluded: json.parse<string[]>(t.excluded, []),
      program: json.parse<{ day: number; title: string; text: string }[]>(t.program, []),
      departures: json.parse<string[]>(t.departures, []),
      status: t.status,
      rejectionReason: t.rejectionReason,
      publishedAt: t.publishedAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    })),
  );
});

// ---------------------------------------------------------------------------
//  Create new tour (draft → pending)
// ---------------------------------------------------------------------------

const createSchema = z.object({
  title: z.string().min(3).max(120),
  country: z.string().min(2).max(60),
  city: z.string().min(2).max(60),
  region: z.string().max(40).optional(),  // resolved by lookup if missing
  shortDescription: z.string().max(280).optional().default(""),
  description: z.string().max(8000).optional().default(""),
  price: z.number().int().min(50).max(50_000),
  durationNights: z.number().int().min(1).max(60).default(7),
  hotelStars: z.number().int().min(1).max(5).default(4),
  meal: z.string().max(40).default("Breakfast"),
});

/**
 * Country → region resolver. Previously every organiser-created tour was
 * dropped into the "Europe" bucket — Bali/Tokyo/Cairo tours then didn't
 * surface in any region-specific catalog filter (audit-final F18).
 */
const REGION_BY_COUNTRY: Record<string, string> = {
  // Europe
  Ukraine: "Europe", Poland: "Europe", Germany: "Europe", France: "Europe",
  Italy: "Europe", Spain: "Europe", Portugal: "Europe", Greece: "Europe",
  Netherlands: "Europe", Belgium: "Europe", Austria: "Europe", Switzerland: "Europe",
  "Czech Republic": "Europe", Czechia: "Europe", Hungary: "Europe",
  Slovakia: "Europe", Croatia: "Europe", Slovenia: "Europe", Romania: "Europe",
  Bulgaria: "Europe", Iceland: "Europe", Norway: "Europe", Sweden: "Europe",
  Finland: "Europe", Denmark: "Europe", Ireland: "Europe",
  "United Kingdom": "Europe", Estonia: "Europe", Latvia: "Europe",
  Lithuania: "Europe",
  // Asia
  Japan: "Asia", China: "Asia", Thailand: "Asia", Vietnam: "Asia",
  Indonesia: "Asia", "South Korea": "Asia", India: "Asia", Malaysia: "Asia",
  Singapore: "Asia", Philippines: "Asia", Cambodia: "Asia", Laos: "Asia",
  Mongolia: "Asia", Nepal: "Asia", "Sri Lanka": "Asia", Bali: "Asia",
  // Middle East
  Turkey: "Middle East", UAE: "Middle East", Israel: "Middle East",
  Jordan: "Middle East", Lebanon: "Middle East", Oman: "Middle East",
  Iran: "Middle East", "Saudi Arabia": "Middle East",
  // Africa
  Egypt: "Africa", Morocco: "Africa", Tunisia: "Africa", "South Africa": "Africa",
  Kenya: "Africa", Tanzania: "Africa", Namibia: "Africa", Botswana: "Africa",
  Ethiopia: "Africa", Madagascar: "Africa",
  // Americas
  USA: "Americas", "United States": "Americas", Canada: "Americas",
  Mexico: "Americas", Brazil: "Americas", Argentina: "Americas", Chile: "Americas",
  Peru: "Americas", Colombia: "Americas", Cuba: "Americas", Bolivia: "Americas",
  Ecuador: "Americas", "Costa Rica": "Americas", Panama: "Americas",
  // Oceania
  Australia: "Oceania", "New Zealand": "Oceania", Fiji: "Oceania",
  "French Polynesia": "Oceania",
};
function resolveRegion(country: string, fallback?: string): string {
  return REGION_BY_COUNTRY[country.trim()] ?? fallback ?? "Europe";
}

/** Slugify + guarantee uniqueness against the existing catalog. The random
 *  suffix is 4 base36 chars (~1.6M space) so collisions are rare, but we
 *  still retry up to 5 times with a fresh suffix to avoid the uncaught
 *  P2002 the audit caught. After 5 retries we give up and let Prisma error
 *  bubble — that's a sign someone's brute-forcing slug creation. */
async function makeSlug(title: string): Promise<string> {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "tour";
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await prisma.tour.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  // Fallback: deterministic-ish from current ms — basically guaranteed unique.
  return `${base}-${Date.now().toString(36)}`;
}

organizerCabinetRouter.post("/tours", requireOrganizer, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const slug = await makeSlug(d.title);

  // Every new tour starts in moderation. Until admin approves, it's hidden
  // from the public catalog (the public /api/tours endpoint filters by
  // status="active"). The organizer can still edit / upload photos.
  const tour = await prisma.tour.create({
    data: {
      slug,
      // Trim whitespace so "spain " and "Spain" don't fragment the catalog
      // filter (which uses exact-match `country IN (...)` lookups).
      country: d.country.trim(),
      city: d.city.trim(),
      // Auto-resolve region from the country so Tokyo/Bali don't land in
      // the Europe bucket. Falls back to whatever the client sent (or
      // "Europe") if the country isn't in our table.
      region: resolveRegion(d.country, d.region),
      title: d.title.trim(),
      shortDescription: d.shortDescription,
      description: d.description,
      highlights: JSON.stringify([]),
      included: JSON.stringify([]),
      excluded: JSON.stringify([]),
      program: JSON.stringify([]),
      themes: JSON.stringify([]),
      departures: JSON.stringify([]),
      durationNights: d.durationNights,
      hotelStars: d.hotelStars,
      meal: d.meal,
      price: d.price,
      // Visual placeholder until the organizer uploads a hero photo.
      emoji: "✈",
      gradient: "linear-gradient(135deg, #5B8FF9 0%, #FF8A4C 100%)",
      imageCount: 0,
      rating: 0,
      reviewsCount: 0,
      organizerId: req.organizerId!,
      status: "pending",
    },
  });
  res.status(201).json({ slug: tour.slug });
});

const editSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  shortDescription: z.string().max(280).optional(),
  description: z.string().max(8000).optional(),
  price: z.number().int().min(50).max(50_000).optional(),
  oldPrice: z.number().int().min(0).max(50_000).nullable().optional(),
  durationNights: z.number().int().min(1).max(60).optional(),
  hotelStars: z.number().int().min(1).max(5).optional(),
  meal: z.string().max(40).optional(),
  themes: z.array(z.string().max(32)).max(8).optional(),
  highlights: z.array(z.string().max(200)).max(8).optional(),
  included: z.array(z.string().max(200)).max(20).optional(),
  excluded: z.array(z.string().max(200)).max(20).optional(),
  program: z.array(z.object({
    day: z.number().int().min(1),
    title: z.string().max(120),
    text: z.string().max(800),
  })).max(30).optional(),
  departures: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).optional(),
});

organizerCabinetRouter.patch("/tours/:slug", requireOrganizer, async (req: AuthedRequest, res) => {
  const guard = await ownTour(String(req.params.slug), req.organizerId!);
  if (!guard.tour) {
    res.status(guard.status ?? 500).json({ error: guard.error ?? "fail" });
    return;
  }
  const tour = guard.tour;
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.shortDescription !== undefined) data.shortDescription = d.shortDescription;
  if (d.description !== undefined) data.description = d.description;
  if (d.price !== undefined) data.price = d.price;
  if (d.oldPrice !== undefined) data.oldPrice = d.oldPrice;
  if (d.durationNights !== undefined) data.durationNights = d.durationNights;
  if (d.hotelStars !== undefined) data.hotelStars = d.hotelStars;
  if (d.meal !== undefined) data.meal = d.meal;
  if (d.themes !== undefined) data.themes = JSON.stringify(d.themes);
  if (d.highlights !== undefined) data.highlights = JSON.stringify(d.highlights);
  if (d.included !== undefined) data.included = JSON.stringify(d.included);
  if (d.excluded !== undefined) data.excluded = JSON.stringify(d.excluded);
  if (d.program !== undefined) data.program = JSON.stringify(d.program);
  if (d.departures !== undefined) data.departures = JSON.stringify(d.departures);

  // Re-moderation rule: significant edits to active or rejected tours bump
  // the status back to "pending" so an admin re-reviews. Minor cosmetic
  // edits (photos, departures, contact details) do NOT trigger this — only
  // the user-facing content + price.
  const MAJOR_FIELDS = ["title", "description", "shortDescription", "price", "themes", "program", "highlights"] as const;
  const majorChanged = MAJOR_FIELDS.some((k) => {
    const next = (d as Record<string, unknown>)[k];
    if (next === undefined) return false;
    if (k === "themes" || k === "program" || k === "highlights") {
      const before = k === "program"
        ? (json.parse<unknown[]>(tour.program, []))
        : (json.parse<string[]>(tour[k as "themes" | "highlights"], []));
      return JSON.stringify(before) !== JSON.stringify(next);
    }
    return (tour as unknown as Record<string, unknown>)[k] !== next;
  });
  let bumpedToPending = false;
  if (majorChanged && (tour.status === "active" || tour.status === "rejected")) {
    data.status = "pending";
    data.rejectionReason = null;
    bumpedToPending = true;
  }

  const updated = await prisma.tour.update({ where: { id: tour.id }, data });
  res.json({ ok: true, slug: updated.slug, status: updated.status, bumpedToPending });
});

// ---------------------------------------------------------------------------
//  Status toggle — organizer wants to temporarily disable / re-enable a tour
// ---------------------------------------------------------------------------
const statusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});
organizerCabinetRouter.patch("/tours/:slug/status", requireOrganizer, async (req: AuthedRequest, res) => {
  const guard = await ownTour(String(req.params.slug), req.organizerId!);
  if (!guard.tour) {
    res.status(guard.status ?? 500).json({ error: guard.error ?? "fail" });
    return;
  }
  const tour = guard.tour;
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  // Organizers can only flip between active <-> disabled. They CANNOT push
  // their own tour from pending to active — that's an admin decision.
  if (tour.status === "pending" || tour.status === "rejected") {
    res.status(400).json({ error: "tour is awaiting / rejected by moderation; cannot self-publish" });
    return;
  }
  const updated = await prisma.tour.update({
    where: { id: tour.id },
    data: { status: parsed.data.status },
  });
  res.json({ ok: true, status: updated.status });
});

// ---------------------------------------------------------------------------
//  Bookings on the organizer's own tours
// ---------------------------------------------------------------------------
organizerCabinetRouter.get("/bookings", requireOrganizer, async (req: AuthedRequest, res) => {
  // Find all bookings whose tour's organizerId is the caller's.
  const rows = await prisma.booking.findMany({
    where: { tour: { organizerId: req.organizerId! } },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      tour: { select: { slug: true, title: true, country: true, city: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });
  res.json(rows.map((b) => ({
    id: b.id,
    travelers: json.parse<unknown[]>(b.travelers, []),
    contact: json.parse<unknown>(b.contact, {}),
    addOns: json.parse<string[]>(b.addOns, []),
    totalPrice: b.totalPrice,
    currency: b.currency,
    totalInCurrency: b.totalInCurrency,
    specialRequest: b.specialRequest,
    status: b.status,
    startDate: b.startDate?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    tour: b.tour,
    user: b.user,
  })));
});

organizerCabinetRouter.post(
  "/tours/:slug/hero",
  requireOrganizer,
  upload.single("image"),
  async (req: AuthedRequest, res) => {
    const guard = await ownTour(String(req.params.slug), req.organizerId!);
    if (!guard.tour) {
      res.status(guard.status ?? 500).json({ error: guard.error ?? "fail" });
      return;
    }
    const tour = guard.tour;
    if (!req.file) {
      res.status(400).json({ error: "no file" });
      return;
    }
    await writeHero(tour.slug, req.file.buffer);
    // hero is the "0-th" image — but imageCount tracks gallery. We bump to at
    // least 1 so it shows in catalog (hide-incomplete filter).
    const updated = await prisma.tour.update({
      where: { id: tour.id },
      data: { imageCount: Math.max(1, tour.imageCount) },
    });
    res.json({ ok: true, imageCount: updated.imageCount });
  },
);

organizerCabinetRouter.post(
  "/tours/:slug/gallery",
  requireOrganizer,
  upload.single("image"),
  async (req: AuthedRequest, res) => {
    const guard = await ownTour(String(req.params.slug), req.organizerId!);
    if (!guard.tour) {
      res.status(guard.status ?? 500).json({ error: guard.error ?? "fail" });
      return;
    }
    const tour = guard.tour;
    if (!req.file) {
      res.status(400).json({ error: "no file" });
      return;
    }
    const newIdx = await appendGallery(tour.slug, req.file.buffer, tour.imageCount);
    const updated = await prisma.tour.update({
      where: { id: tour.id },
      data: { imageCount: newIdx },
    });
    res.json({ ok: true, imageCount: updated.imageCount, addedIndex: newIdx });
  },
);

organizerCabinetRouter.delete(
  "/tours/:slug/gallery/:idx",
  requireOrganizer,
  async (req: AuthedRequest, res) => {
    const guard = await ownTour(String(req.params.slug), req.organizerId!);
    if (!guard.tour) {
      res.status(guard.status ?? 500).json({ error: guard.error ?? "fail" });
      return;
    }
    const tour = guard.tour;
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 1) {
      res.status(400).json({ error: "bad index" });
      return;
    }
    const dir = path.join(TOUR_IMG_ROOT, tour.slug);
    // Delete both jpg and webp; ignore if missing.
    for (const ext of ["jpg", "webp"]) {
      await fs.unlink(path.join(dir, `gallery-${idx}.${ext}`)).catch(() => {});
    }
    // Renumber later files down so the sequence stays dense.
    let last = tour.imageCount;
    for (let i = idx + 1; i <= last; i++) {
      for (const ext of ["jpg", "webp"]) {
        const from = path.join(dir, `gallery-${i}.${ext}`);
        const to = path.join(dir, `gallery-${i - 1}.${ext}`);
        await fs.rename(from, to).catch(() => {});
      }
    }
    last = Math.max(0, last - 1);
    const updated = await prisma.tour.update({
      where: { id: tour.id },
      data: { imageCount: last },
    });
    res.json({ ok: true, imageCount: updated.imageCount });
  },
);

// ---------------------------------------------------------------------------
//  Profile
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  bio: z.string().max(800).optional(),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  yearsActive: z.number().int().min(0).max(80).optional(),
});

organizerCabinetRouter.patch("/profile", requireOrganizer, async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = await prisma.organizer.update({
    where: { id: req.organizerId! },
    data: parsed.data,
  });
  res.json({
    id: updated.id,
    slug: updated.slug,
    name: updated.name,
    bio: updated.bio,
    phone: updated.phone,
    whatsapp: updated.whatsapp ?? null,
    yearsActive: updated.yearsActive,
  });
});
