/**
 * Platform admin routes. Three logical surfaces, mounted under /api/admin:
 *   - /auth           — admin login + me
 *   - /tours          — moderation queue, approve/reject/delete
 *   - /bookings       — read-only list of every booking + customer
 *   - /organizers     — list / inspect operators
 *   - /admins         — super-only: create new admins
 *
 * Every endpoint goes through requireAdmin EXCEPT login. Some endpoints also
 * gate on role === "super" (creating new admins).
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { json, prisma } from "../db.js";
import {
  type AuthedRequest,
  requireAdmin,
  signAdminToken,
} from "../middleware/auth.js";

export const adminRouter = Router();

// ---------------------------------------------------------------------------
//  Auth
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(72),
});

adminRouter.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const token = signAdminToken(admin.id);
  res.json({ token, admin: publicAdmin(admin) });
});

adminRouter.get("/auth/me", requireAdmin, async (req: AuthedRequest, res) => {
  const a = await prisma.admin.findUnique({ where: { id: req.adminId! } });
  if (!a) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(publicAdmin(a));
});

function publicAdmin(a: Awaited<ReturnType<typeof prisma.admin.findFirstOrThrow>>) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role,
    createdAt: a.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
//  Tours moderation
// ---------------------------------------------------------------------------

// List tours, optionally filtered by status. Includes organizer summary so
// the admin moderation table needs only ONE round-trip per render.
adminRouter.get("/tours", requireAdmin, async (req: AuthedRequest, res) => {
  const status = req.query.status as string | undefined;
  const where = status ? { status } : {};
  const rows = await prisma.tour.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { organizer: true },
    take: 500,
  });
  res.json(rows.map((t) => ({
    slug: t.slug,
    title: t.title,
    country: t.country,
    city: t.city,
    price: t.price,
    durationNights: t.durationNights,
    imageCount: t.imageCount,
    status: t.status,
    rejectionReason: t.rejectionReason,
    createdAt: t.createdAt.toISOString(),
    organizer: t.organizer ? {
      id: t.organizer.id,
      slug: t.organizer.slug,
      name: t.organizer.name,
      email: t.organizer.email,
      phone: t.organizer.phone,
    } : null,
  })));
});

// Full tour details — every field + computed counts. Used by the admin tour
// review page where moderation decisions get made.
adminRouter.get("/tours/:slug", requireAdmin, async (req: AuthedRequest, res) => {
  const tour = await prisma.tour.findUnique({
    where: { slug: String(req.params.slug) },
    include: { organizer: true },
  });
  if (!tour) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const [bookingsCount, reviewsCount] = await Promise.all([
    prisma.booking.count({ where: { tourId: tour.id } }),
    prisma.review.count({ where: { tourId: tour.id } }),
  ]);
  res.json({
    slug: tour.slug,
    title: tour.title,
    country: tour.country,
    city: tour.city,
    region: tour.region,
    shortDescription: tour.shortDescription,
    description: tour.description,
    highlights: json.parse<string[]>(tour.highlights, []),
    included: json.parse<string[]>(tour.included, []),
    excluded: json.parse<string[]>(tour.excluded, []),
    program: json.parse<unknown[]>(tour.program, []),
    themes: json.parse<string[]>(tour.themes, []),
    departures: json.parse<string[]>(tour.departures, []),
    durationNights: tour.durationNights,
    hotelStars: tour.hotelStars,
    meal: tour.meal,
    price: tour.price,
    oldPrice: tour.oldPrice,
    imageCount: tour.imageCount,
    status: tour.status,
    rejectionReason: tour.rejectionReason,
    popularity: tour.popularity,
    createdAt: tour.createdAt.toISOString(),
    bookingsCount,
    reviewsCount,
    organizer: tour.organizer ? {
      id: tour.organizer.id,
      slug: tour.organizer.slug,
      name: tour.organizer.name,
      type: tour.organizer.type,
      bio: tour.organizer.bio,
      email: tour.organizer.email,
      phone: tour.organizer.phone,
      whatsapp: tour.organizer.whatsapp,
      yearsActive: tour.organizer.yearsActive,
      verified: tour.organizer.verified,
    } : null,
  });
});

adminRouter.post("/tours/:slug/approve", requireAdmin, async (req: AuthedRequest, res) => {
  const updated = await prisma.tour.update({
    where: { slug: String(req.params.slug) },
    data: { status: "active", rejectionReason: null },
  });
  res.json({ ok: true, slug: updated.slug, status: updated.status });
});

const rejectSchema = z.object({
  reason: z.string().min(3).max(800),
});
adminRouter.post("/tours/:slug/reject", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = await prisma.tour.update({
    where: { slug: String(req.params.slug) },
    data: { status: "rejected", rejectionReason: parsed.data.reason },
  });
  res.json({ ok: true, slug: updated.slug, status: updated.status });
});

adminRouter.delete("/tours/:slug", requireAdmin, async (req: AuthedRequest, res) => {
  // Cascade is configured in schema — bookings/reviews/saves of this tour
  // are deleted with it. That's intentional for a hard moderation delete;
  // a softer "archive" status would be the next step if we ever need it.
  await prisma.tour.delete({ where: { slug: String(req.params.slug) } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Bookings (admin: list + change status)
// ---------------------------------------------------------------------------
adminRouter.get("/bookings", requireAdmin, async (_req, res) => {
  const rows = await prisma.booking.findMany({
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      user: { select: { id: true, email: true, name: true } },
      tour: { include: { organizer: { select: { id: true, name: true, slug: true, email: true } } } },
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
    user: b.user,
    tour: {
      slug: b.tour.slug,
      title: b.tour.title,
      country: b.tour.country,
      city: b.tour.city,
      status: b.tour.status,
    },
    organizer: b.tour.organizer,
  })));
});

// Allowed booking statuses — keep in sync with the StatusFilter union on the
// admin bookings page. "confirmed" is the default fresh state; "completed"
// is set once the trip date passes (or manually by admin); "cancelled" is
// what we land on when the user / admin cancels.
const BOOKING_STATUSES = ["confirmed", "completed", "cancelled"] as const;
const updateBookingSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
});

adminRouter.patch("/bookings/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "bad id" });
    return;
  }
  const parsed = updateBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: parsed.data.status },
    });
    res.json({ ok: true, id: updated.id, status: updated.status });
  } catch (e) {
    if ((e as { code?: string }).code === "P2025") {
      res.status(404).json({ error: "booking not found" });
      return;
    }
    throw e;
  }
});

// ---------------------------------------------------------------------------
//  Organizers (read-only for admin)
// ---------------------------------------------------------------------------
adminRouter.get("/organizers", requireAdmin, async (_req, res) => {
  const orgs = await prisma.organizer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tours: true } } },
  });
  res.json(orgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    type: o.type,
    email: o.email,
    phone: o.phone,
    whatsapp: o.whatsapp,
    yearsActive: o.yearsActive,
    verified: o.verified,
    createdAt: o.createdAt.toISOString(),
    toursCount: o._count.tours,
  })));
});

// ---------------------------------------------------------------------------
//  Admins (super-only create + listing)
// ---------------------------------------------------------------------------
function requireSuper(req: AuthedRequest, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) {
  // Look up the role in-line. Cheap (1 row, indexed PK) and avoids
  // adding another middleware tier just for one check.
  prisma.admin.findUnique({ where: { id: req.adminId! } }).then((a) => {
    if (!a || a.role !== "super") {
      res.status(403).json({ error: "super admin required" });
      return;
    }
    next();
  }).catch(() => {
    res.status(500).json({ error: "auth check failed" });
  });
}

adminRouter.get("/admins", requireAdmin, async (_req, res) => {
  const rows = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  res.json(rows.map(publicAdmin));
});

const createAdminSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(80),
  password: z.string().min(6).max(72),
  role: z.enum(["admin", "super"]).optional().default("admin"),
});

adminRouter.post("/admins", requireAdmin, requireSuper, async (req: AuthedRequest, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, name, password, role } = parsed.data;
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "email already taken" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.admin.create({ data: { email, name, passwordHash, role } });
  res.status(201).json(publicAdmin(admin));
});

adminRouter.delete("/admins/:id", requireAdmin, requireSuper, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "bad id" });
    return;
  }
  if (id === req.adminId) {
    // Don't let supers nuke themselves — leaves the platform without any admin.
    res.status(400).json({ error: "cannot delete yourself" });
    return;
  }
  await prisma.admin.delete({ where: { id } });
  res.json({ ok: true });
});
