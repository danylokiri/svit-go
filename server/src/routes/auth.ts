import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest, requireAuth, signToken } from "../middleware/auth.js";

export const authRouter = Router();

// Upper bounds protect bcrypt + DB from oversized payloads (bcrypt is O(n)
// over the password bytes, and a 10MB string would burn CPU for nothing).
const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(72),
  name: z.string().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(72),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "email already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, name, passwordHash },
  });

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(publicUser(user));
});

// AI preferences (PATCH). Lengths capped so a malformed/oversized field
// can't bloat the user row.
const prefsSchema = z.object({
  budgetFrom: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  budgetTo:   z.number().int().nonnegative().max(1_000_000).nullable().optional(),
  favThemes:  z.array(z.string().max(32)).max(20).optional(),
  travelFreq: z.string().max(32).nullable().optional(),
  companion:  z.string().max(32).nullable().optional(),
  citizenship:z.string().max(8).nullable().optional(),
});

authRouter.patch("/prefs", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.favThemes) {
    data.favThemes = JSON.stringify(parsed.data.favThemes);
  }
  const user = await prisma.user.update({
    where: { id: req.userId! },
    data,
  });
  res.json(publicUser(user));
});

function publicUser(u: Awaited<ReturnType<typeof prisma.user.findFirstOrThrow>>) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    budgetFrom: u.budgetFrom,
    budgetTo: u.budgetTo,
    favThemes: json.parse<string[]>(u.favThemes, []),
    travelFreq: u.travelFreq,
    companion: u.companion,
    citizenship: u.citizenship,
    createdAt: u.createdAt.toISOString(),
  };
}
