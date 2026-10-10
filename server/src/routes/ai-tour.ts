/**
 * Tour-scoped AI chat.
 *
 *   client → POST /api/ai/ask-tour  { tourSlug, question, history }
 *           ↓
 *   server fetches the full tour record + user prefs (if logged in)
 *           ↓
 *   server builds an OpenAI system prompt with the tour data
 *           ↓
 *   llm.chat() — strict-JSON response
 *           ↓
 *   server returns { reply, needsHumanContact?, suggestedFollowUps }
 *
 * `needsHumanContact` is a flag the client uses to show the "Contact
 * organiser" button. If the LLM is unavailable or fails we return an
 * honest "try again" message — no pretend-AI fallback.
 */
import { Router } from "express";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest } from "../middleware/auth.js";
import { llm, parseJSON } from "../lib/llm.js";
import { computeRating } from "../lib/ratings.js";

export const aiTourRouter = Router();

const askSchema = z.object({
  tourSlug: z.string(),
  question: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "ai"]), text: z.string() }))
    .optional()
    .default([]),
  locale: z.enum(["en", "uk"]).optional().default("en"),
});

aiTourRouter.post("/ask-tour", async (req: AuthedRequest, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { tourSlug, question, locale } = parsed.data;
  const tour = await prisma.tour.findUnique({ where: { slug: tourSlug } });
  if (!tour) {
    res.status(404).json({ error: "tour not found" });
    return;
  }

  // Pull the organiser too so the model can name them ("Operated by Aegean
  // Explorers, a verified company") — but we deliberately DON'T put email /
  // phone / whatsapp in the context. Contacts live on a separate "Contact
  // organiser" button (see needsHumanContact below) — putting them in the
  // chat reply would leak PII into sessionStorage, screenshots, and any
  // copy-pasted transcript the user shares.
  const organizer = tour.organizerId
    ? await prisma.organizer.findUnique({ where: { id: tour.organizerId } })
    : null;

  // Pre-fetch the latest reviews + live rating so the model can answer
  // "what do people think about this tour?". Capped at 5 most recent — older
  // reviews drift further from the current product (organisers update tours)
  // and we don't want to blow the context budget. Reviewer names are
  // truncated to first names because that's what shows on the public tour
  // page; full names aren't exposed in the API anyway.
  const reviewRows = await prisma.review.findMany({
    where: { tourId: tour.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const liveRating = await computeRating(tour.id);
  const reviewsBlock = {
    rating: liveRating.reviews > 0 ? liveRating.rating : null, // 0–5 or null when empty
    totalCount: liveRating.reviews,
    recent: reviewRows.map((r) => ({
      reviewer: r.user.name.split(/\s+/)[0],
      rating: r.rating,
      title: r.title,
      body: r.body.length > 280 ? r.body.slice(0, 280) + "…" : r.body,
      date: r.createdAt.toISOString().slice(0, 10),
    })),
  };

  // ---- Build the "context bag" (mock equivalent of a system prompt) -------
  const context = {
    title: tour.title,
    country: tour.country,
    city: tour.city,
    region: tour.region,
    durationNights: tour.durationNights,
    hotelStars: tour.hotelStars,
    meal: tour.meal,
    price: tour.price,
    oldPrice: tour.oldPrice ?? undefined,
    themes: json.parse<string[]>(tour.themes, []),
    description: tour.description,
    shortDescription: tour.shortDescription,
    highlights: json.parse<string[]>(tour.highlights, []),
    included: json.parse<string[]>(tour.included, []),
    excluded: json.parse<string[]>(tour.excluded, []),
    program: json.parse<{ day: number; title: string; text: string }[]>(tour.program, []),
    organizer: organizer ? {
      name: organizer.name,
      type: organizer.type,            // "company" | "private"
      yearsActive: organizer.yearsActive,
      verified: organizer.verified,
      // Contacts (email/phone/whatsapp) intentionally omitted — see comment above.
    } : null,
    reviews: reviewsBlock,
  };

  // User prefs (if authed) — model can personalise answers. citizenship
  // is included so the AI can give a rough visa hint for the destination.
  let prefs: {
    favThemes?: string[];
    budgetFrom?: number | null;
    budgetTo?: number | null;
    companion?: string | null;
    citizenship?: string | null;
  } = {};
  if (req.userId) {
    const u = await prisma.user.findUnique({ where: { id: req.userId } });
    if (u) {
      prefs = {
        favThemes: json.parse<string[]>(u.favThemes, []),
        budgetFrom: u.budgetFrom,
        budgetTo: u.budgetTo,
        companion: u.companion,
        citizenship: u.citizenship,
      };
    }
  }

  // ----- Try real LLM first -----
  let result: InferenceResult | null = null;

  if (llm.enabled()) {
    const system = `You are SvitGo's friendly assistant answering questions about ONE specific tour. Primary source of truth is the tour data and user profile below. Be honest if you don't know — don't invent specific tour details that aren't in the data.

TOUR:
${JSON.stringify(context)}

USER PROFILE (may be empty):
${JSON.stringify(prefs)}

GUIDELINES:
- Be conversational and concise (2-5 sentences max).
- ${locale === "uk" ? "Reply in UKRAINIAN only. Place names like the country/city can stay in their original form." : "Speak in English."}
- PLAIN TEXT ONLY in the \`reply\` field — no Markdown of any kind (no \`**bold**\`, no headers, no bullet/numbered lists, no code fences). The frontend renders the text verbatim, so markdown syntax shows up as literal characters.
- If asked "would this fit me?" — use the user profile to give a real answer.
- VISA / ENTRY REQUIREMENTS: you MAY answer using your general knowledge of visa rules between the user's citizenship (USER PROFILE → citizenship, ISO-2 code, e.g. "UA" = Ukraine, "PL" = Poland, "US" = United States) and the tour's destination country. Give the practical answer: visa-free / visa-on-arrival / e-visa / embassy visa, typical stay length, and remind them to double-check with the official embassy site since rules change. Only set needsHumanContact=true here if you genuinely don't know (e.g. citizenship is empty or an unusual code).
- ORGANISER CONTACTS: if the user asks for the organiser's phone, email, WhatsApp, "how do I contact them", "give me their number", etc. — DO NOT say "I don't have access" or "check the website". The chat already has a "Contact organiser" button that appears whenever \`needsHumanContact=true\`. Reply with ONE short sentence telling them to tap that button (you can name the organiser from \`organizer.name\` if you want), and set \`needsHumanContact=true\`. NEVER attempt to print email / phone / WhatsApp in your reply — those details belong on the button, not in chat history.
- ORGANISER QUESTIONS in general ("who runs this tour?", "is it a company or a guide?", "how experienced are they?"): you MAY answer from \`organizer.name\` / \`organizer.type\` / \`organizer.yearsActive\` / \`organizer.verified\`. Only set needsHumanContact=true if they want to actually reach the organiser.
- REVIEWS / WHAT PEOPLE SAY: the \`reviews\` block contains the live aggregated rating (\`reviews.rating\` out of 5), the total count (\`reviews.totalCount\`), and up to 5 most-recent reviews in \`reviews.recent[]\` with reviewer first name, star rating, title, body, date. When the user asks "what do people think", "any reviews?", "is it good?", "as people say…" — summarise the real reviews: lead with the aggregate ("4.5/5 from 12 reviews"), then 1–2 recurring themes from the recent ones (e.g. "travellers praise the boat tour and the breakfast; one mentions the long transfer from the airport"). Quote selectively and briefly if it helps. If \`reviews.totalCount === 0\` or \`reviews.recent\` is empty, say plainly "no reviews yet — this is a newer tour" and set needsHumanContact=false (no need to forward this to the organiser). NEVER invent reviews that aren't in the block.
- For other questions outside the tour data (very recent weather, exact hotel brand, exact bus times) — say so plainly and set needsHumanContact to true.
- Suggest 3 short follow-up questions the user might want to ask next (different topics, not paraphrases of the current question).

OUTPUT FORMAT (STRICT JSON, no markdown):
{
  "reply": "your conversational message (2-5 sentences)",
  "needsHumanContact": true | false,
  "suggestedFollowUps": ["question 1", "question 2", "question 3"]
}`;

    const raw = await llm.chat({
      system,
      user: question,
      json: true,
      rateKey: { userId: req.userId, ip: req.ip },
    });
    const parsed = parseJSON<InferenceResult>(raw);
    if (parsed?.reply && typeof parsed.needsHumanContact === "boolean") {
      result = {
        reply: parsed.reply,
        needsHumanContact: parsed.needsHumanContact,
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
          ? parsed.suggestedFollowUps.slice(0, 4)
          : [],
      };
    }
  }

  // Track success so we only log on real model output. Failed calls used
  // to count toward the user's tier quota (audit-final F1) which meant
  // one OpenAI hiccup could lock a paying user out for the day.
  const llmSucceeded = !!result;

  // ----- Honest fallback if LLM is unavailable / failed -----
  if (!result) {
    result = {
      reply: locale === "uk"
        ? "Вибачте — зараз не можу зв'язатися з AI. Спробуйте ще раз або напишіть організатору."
        : "Oops — I can't reach the AI right now. Try again in a moment, or contact the organiser directly.",
      needsHumanContact: true,
      suggestedFollowUps: [],
    };
  }

  // Log to AiQuery for analytics — only on success, see F1 above.
  if (llmSucceeded) {
    await prisma.aiQuery.create({
      data: {
        userId: req.userId ?? null,
        query: `[tour:${tourSlug}] ${question}`,
        reply: result.reply,
        tourIds: JSON.stringify([tourSlug]),
      },
    });
  }

  res.json(result);
});

// ---------------------------------------------------------------------------
//  Local types used by the route
// ---------------------------------------------------------------------------

interface InferenceResult {
  reply: string;
  needsHumanContact: boolean;
  suggestedFollowUps: string[];
}
