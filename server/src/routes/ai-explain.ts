/**
 * Personalised "Why this tour might fit you" generator. Uses the same scoring
 * logic as the tour-card "AI pick" badge — they always agree.
 *
 * The mock infers from user prefs + tour data; swap `computeMatch` later with
 * a real LLM call without touching the API contract.
 */
import { Router } from "express";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest } from "../middleware/auth.js";
import { computeMatch } from "../lib/match.js";
import { llm } from "../lib/llm.js";

export const aiExplainRouter = Router();

const schema = z.object({ tourSlug: z.string() });

aiExplainRouter.post("/explain-pick", async (req: AuthedRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const tour = await prisma.tour.findUnique({ where: { slug: parsed.data.tourSlug } });
  if (!tour) {
    res.status(404).json({ error: "tour not found" });
    return;
  }

  let user: ReturnType<typeof toUserCtx> | null = null;
  if (req.userId) {
    const u = await prisma.user.findUnique({ where: { id: req.userId } });
    if (u) user = toUserCtx(u);
  }

  const m = computeMatch({
    tourPrice: tour.price,
    tourThemes: json.parse<string[]>(tour.themes, []),
    tourMeal: tour.meal,
    tourStars: tour.hotelStars,
    tourDuration: tour.durationNights,
    user,
  });

  // Build the natural-language reply.
  // LLM-mode: ask the model to write a short personal explanation grounded in the signals.
  // Fallback: deterministic template from the signals (same as before).
  let text: string | null = null;

  if (llm.enabled()) {
    const ctx = {
      city: tour.city,
      country: tour.country,
      score: m.score,
      personal: m.personal,
      signals: m.signals,
    };
    const system = `You write ONE concise sentence (max 25 words) explaining why a specific tour might or might not fit the user, grounded ONLY in the provided signals. No filler, no marketing fluff, no quotes, no emoji.`;
    const userMsg = `Match data:\n${JSON.stringify(ctx)}\n\nWrite the sentence. If score < 50, lead with the caveat. If signals empty, say it's outside their usual picks.`;
    const raw = await llm.chat({ system, user: userMsg, rateKey: { userId: req.userId, ip: req.ip } });
    if (raw && raw.length < 300) text = raw.replace(/^["']|["']$/g, "");
  }

  if (!text) {
    const top = m.signals.slice(0, 3);
    if (!m.personal) {
      text = top.length > 0
        ? `A solid pick — ${top.join(", ")}. Sign in to see how it matches you personally.`
        : "A balanced pick — comfortable hotel, varied program. Sign in to see how it matches your preferences.";
    } else if (top.length === 0) {
      text = "Honestly, this one's a bit outside your usual picks. Doesn't mean it won't be fun — just less of an obvious match.";
    } else if (m.score >= 80) {
      text = `Strong match — ${top.join("; ")}.`;
    } else if (m.score >= 65) {
      text = `Good fit — ${top.join("; ")}.`;
    } else {
      text = `Why this might fit: ${top.join("; ")}.`;
    }
  }

  res.json({
    text,
    signals: m.signals,
    matchScore: m.score,
    personal: m.personal,
  });
});

function toUserCtx(u: Awaited<ReturnType<typeof prisma.user.findFirstOrThrow>>) {
  return {
    budgetFrom: u.budgetFrom,
    budgetTo: u.budgetTo,
    favThemes: json.parse<string[]>(u.favThemes, []),
    companion: u.companion,
  };
}
