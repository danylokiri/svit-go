/**
 * General AI search endpoint — uses OpenAI tool calling (function calling).
 *
 * Flow:
 *   1. LLM gets a short system prompt + user profile + tools schema (NO catalog inlined).
 *   2. LLM decides which tools to call: searchTours / getTourDetails / getReviews / getActiveDeals.
 *   3. Server executes each tool against the DB and feeds results back.
 *   4. Loop until LLM returns a final JSON answer (capped at 5 iterations).
 *
 * If LLM is unavailable or hits the iteration cap, the endpoint returns a
 * polite "try again later" message (no pretend-AI fallback).
 */
import { Router } from "express";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest } from "../middleware/auth.js";
import { chatWithTools, parseJSON } from "../lib/llm.js";
import { computeRatingsBatch } from "../lib/ratings.js";
import { aiTools, executeTool } from "../lib/ai-tools.js";

export const aiRouter = Router();

const chatSchema = z.object({
  query: z.string().min(1).max(2000),
  // Optional conversation history — frontend keeps the chat in
  // sessionStorage and replays it so the model has context (the chat
  // endpoint itself is stateless on the server side).
  history: z
    .array(
      z.object({
        role: z.enum(["user", "ai"]),
        text: z.string().max(4000),
      })
    )
    .max(20)
    .optional()
    .default([]),
  locale: z.enum(["en", "uk"]).optional().default("en"),
});

interface UserPrefs {
  budgetFrom?: number | null;
  budgetTo?: number | null;
  favThemes?: string[];
  companion?: string | null;
}

aiRouter.post("/chat", async (req: AuthedRequest, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { query, history, locale } = parsed.data;
  // Normalize history to the role names OpenAI expects ("ai" → "assistant").
  const chatHistory = history.map((m) => ({
    role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
    content: m.text,
  }));

  // Load profile (used in system prompt, shapes the recommendations)
  let prefs: UserPrefs = {};
  if (req.userId) {
    const u = await prisma.user.findUnique({ where: { id: req.userId } });
    if (u) {
      prefs = {
        budgetFrom: u.budgetFrom,
        budgetTo: u.budgetTo,
        favThemes: json.parse<string[]>(u.favThemes, []),
        companion: u.companion,
      };
    }
  }

  const system = `You are SvitGo's friendly travel assistant. Help the user find tours from our catalog by CALLING THE PROVIDED TOOLS.

USER PROFILE (use it to personalise; may be empty):
${JSON.stringify(prefs)}

CONTEXT RULES (very important):
- You see the prior turns of this conversation above. Use them. If the user just said "I want to go to Cairo" in a previous turn and now says "idk", they are still asking about Cairo — search Cairo with broad themes, don't search globally.
- The user's destination, themes, and budget are sticky: once mentioned, keep them in mind until they explicitly change topic.
- HARD-BUDGET CONFLICT WITH STICKY REGION — CRITICAL: when the user gives a new explicit budget ("I have €2000", "max €1500", "cheaper") that the previously-named region cannot satisfy, you MUST:
   1. Detect the conflict by running searchTours({region: <sticky region>, priceMax: <new budget>, themes: <sticky themes>}) and seeing zero or sparse results.
   2. State the conflict EXPLICITLY in your reply ("Oceania doesn't have anything under €2000 — its cheapest options start around €2680").
   3. PIVOT regions: run a fresh searchTours WITHOUT the region filter, keeping only themes + priceMax. Show 3-5 of those alternatives.
   4. Phrasing: "but here's what your themes look like at that budget elsewhere — [list]". Do NOT repeat the original region's over-budget options as the recommendation — the user already rejected the price.
   Don't loop. If the user pushes back two turns in a row asking for cheaper, you've already broken sticky-region — don't snap back to it.

TOOL USE — CRITICAL:
- The tour catalog is stored in ENGLISH. All country and city values in the database are English names ("Spain", "Greece", "Czechia", "Japan", "United Arab Emirates" — never "Іспанія" or "España" or "Япония"). When calling searchTours, you MUST translate the user's country/city to its English form first. Examples:
    "Іспанія" → "Spain"        "Греція" → "Greece"
    "Японія" → "Japan"         "Чехія" → "Czechia"
    "Туреччина" → "Turkey"     "Італія" → "Italy"
    "Київ" → "Kyiv"            "Барселона" → "Barcelona"

- GEOGRAPHY — use the \`region\` parameter when the user names a region rather than a specific country. The catalog is grouped into 6 base regions:
    Europe, Asia, Africa, Americas, Oceania, Middle East
  And also accepts these SUB-REGIONS (the server expands them to country lists):
    Americas → "South America", "North America", "Central America", "Caribbean", "Latin America"
    Asia → "Southeast Asia", "South Asia", "East Asia"
    Europe → "Western Europe", "Southern Europe", "Eastern Europe", "Scandinavia"
    Africa → "North Africa", "Sub-Saharan Africa", "East Africa", "Southern Africa"
    Cross-region → "Indian Ocean", "Pacific Islands"
  So "I want to go to South America" → searchTours({region: "South America", ...}). "Куди в Європу?" → searchTours({region: "Europe", ...}). DO NOT put "South America" into the \`country\` field — it will return zero results.

- FALLBACK LADDER on zero results OR all-results-violate-budget — you MUST step DOWN before saying "no tours":
    1. If the user gave a hard priceMax and EVERY result exceeds it, that counts as zero. Don't recommend over-budget tours unless the user explicitly opens the door ("a bit more is fine"). See HARD-BUDGET CONFLICT rule above for the right pivot.
    2. If still zero AND the user named a sub-region, broaden to its base region (e.g. "South America" → "Americas").
    3. If still zero, drop region AND country, keep only themes + priceMax. Search globally.
    4. If STILL zero, drop themes too, keep only priceMax. Show the cheapest match-anything tours and frame as "here's what your budget reaches — none match your themes exactly".
    5. ONLY after that may you tell the user "we don't have anything matching" — and even then show what's closest, never an empty reply.

- ALWAYS call searchTours BEFORE replying — even on FOLLOW-UP questions. If the user pushes back ("really? you have nothing in X?", "are you sure?", "but I thought you had X"), DO NOT just repeat your previous answer — run searchTours again with broader filters per the ladder above. Memory of a past 0-result is not evidence; the user may have changed the search space implicitly.

- You may call searchTours multiple times with different filters to compare options.
- Use getTourDetails when the user asks specifics about a single tour (program, what's included, organiser, aggregate rating) — it now also returns up to 3 recent review snippets, so you often don't need a separate getReviews call.
- Use getReviews when the user wants to dig deeper into what travellers said (more snippets, complaints, recurring themes). It returns the TRUE total review count from the DB, not just the page size — use that aggregate.
- Use getActiveDeals when the user mentions sales / discounts / cheap.
- Never invent tour slugs — only return slugs the tools actually returned.
- Never invent reviews, ratings, organiser names, or program details that aren't in the tool results.

GENERAL TRAVEL KNOWLEDGE — use your training knowledge, don't punt:
- VISA / ENTRY: when the user asks "do I need a visa for X?", USE your knowledge of visa rules between the user's citizenship (USER PROFILE → citizenship, ISO-2 e.g. "UA"=Ukraine, "PL"=Poland) and the destination country. Give the practical answer: visa-free / visa-on-arrival / e-visa / embassy visa, typical stay length. ALWAYS end with "double-check with the embassy / official government site, rules change". If profile citizenship is empty or unusual, say "I'd need to know your citizenship to give a precise answer — but in general for EU/UA passports it's [X]" rather than refusing.
- BEST SEASON / WEATHER PATTERNS / CLIMATE: answer from general knowledge ("Bali is driest May–September; November–March is wet season"). Make clear it's a general pattern, not a forecast.
- LANGUAGE / CURRENCY / TIPPING / SOCKET TYPE / ROUGH SAFETY LEVEL: answer from general knowledge. Be brief.
- DO NOT answer: today's exact weather, today's exchange rate, specific flight times, current political situation, real-time crime stats. Say plainly "that I can't tell you live — check [obvious source]".
- These general-knowledge answers don't require a tool call. Just answer directly in \`reply\`.

REPLY STYLE:
- Be conversational and concise (2-4 sentences). ${locale === "uk" ? "Reply in UKRAINIAN only — every sentence in your `reply` field must be Ukrainian. Tour titles / slugs stay as-is." : "English only."}
- PLAIN TEXT ONLY in the \`reply\` field. NO Markdown of any kind: no \`**bold**\`, no \`*italics*\`, no \`#\` headers, no \`-\` / \`*\` / numbered bullet lists, no code fences. The frontend renders the text as-is — markdown syntax shows up literally to the user.
- When listing tours, write them as natural prose ("Lisbon for €980, Budapest for €720, and Cappadocia for €1480") — never as a numbered list. The tour cards are rendered separately from the \`tourSlugs\` array, so the user already sees them visually.
- If the user is vague, run a sensible broad search FIRST, present 3-4 picks in prose, then ask one short follow-up at the end.
- Use the user's stated budget from their query as the source of truth. The profile budgetTo is just background context — don't tell the user "your budget is X" if they didn't say so this turn.
- NEVER expose internal numbers (the +€200 tolerance, the rate limit, the tool names) — speak as a human assistant, not a system describing its rules.

FINAL OUTPUT FORMAT — when you have enough info, respond in JSON (no markdown, no code fences):
{
  "reply": "your conversational message (2-4 sentences)",
  "tourSlugs": ["slug-1", "slug-2", "slug-3"]
}
- tourSlugs: 3-5 slugs from the tool results that you recommend to the user.
- Return JSON only on your FINAL message (when you're not calling any more tools).`;

  let reply: string | null = null;
  let tourSlugs: string[] = [];
  let toolsUsed: string[] = [];

  const { content, toolsUsed: used } = await chatWithTools({
    system,
    user: query,
    history: chatHistory,
    tools: aiTools,
    onToolCall: executeTool,
    finalJson: true,
    rateKey: { userId: req.userId, ip: req.ip },
  });
  toolsUsed = used;

  if (content) {
    const parsedOut = parseJSON<{ reply?: string; tourSlugs?: unknown }>(content);
    if (parsedOut?.reply && Array.isArray(parsedOut.tourSlugs)) {
      reply = parsedOut.reply;
      // Defensively coerce: model occasionally returns mixed types in the
      // array (numbers, null) — Prisma would throw on that.
      const slugCandidates = parsedOut.tourSlugs.filter(
        (s): s is string => typeof s === "string" && s.length > 0
      );
      // Validate against DB so a hallucinated slug doesn't crash the UI.
      const dbCheck = slugCandidates.length
        ? await prisma.tour.findMany({
            where: { slug: { in: slugCandidates }, imageCount: { gt: 0 } },
            select: { slug: true },
          })
        : [];
      const valid = new Set(dbCheck.map((t) => t.slug));
      tourSlugs = slugCandidates.filter((s) => valid.has(s)).slice(0, 6);
    } else if (parsedOut?.reply) {
      // Got reply but slugs missing — still useful
      reply = parsedOut.reply;
    }
  }

  // Track whether the LLM actually produced a reply. We log to AiQuery
  // ONLY on success — otherwise an LLM outage would silently consume the
  // user's daily tier quota (the limiter counts AiQuery rows), so one bad
  // OpenAI hour could lock a Plus user out of their 100 calls without
  // ever seeing a useful answer (audit-final F1).
  const llmSucceeded = !!reply;

  // Honest fallback — locale-aware so a Ukrainian visitor doesn't get an
  // English error message after talking to the bot in Ukrainian.
  if (!reply) {
    reply = locale === "uk"
      ? "Вибачте — щось пішло не так. Спробуйте ще раз за хвилину."
      : "Oops — something went wrong on our end. Please try again in a moment.";
    tourSlugs = [];
  }

  if (llmSucceeded) {
    await prisma.aiQuery.create({
      data: {
        userId: req.userId ?? null,
        query,
        reply: toolsUsed.length > 0
          ? `[tools: ${toolsUsed.join(",")}] ${reply}`
          : reply,
        tourIds: JSON.stringify(tourSlugs),
      },
    });
  }

  // Hydrate the tours for the response payload
  const tours = await prisma.tour.findMany({
    where: { slug: { in: tourSlugs }, imageCount: { gt: 0 } },
  });
  const ordered = tourSlugs
    .map((slug) => tours.find((t) => t.slug === slug))
    .filter(Boolean) as typeof tours;

  const ratings = await computeRatingsBatch(ordered.map((t) => t.id));

  res.json({
    reply,
    tours: ordered.map((t) => {
      const live = ratings.get(t.id) ?? { rating: 0, reviews: 0 };
      return {
        id: t.slug,
        country: t.country,
        city: t.city,
        region: t.region,
        title: t.title,
        shortDescription: t.shortDescription,
        description: t.description,
        highlights: json.parse<string[]>(t.highlights, []),
        included:   json.parse<string[]>(t.included, []),
        excluded:   json.parse<string[]>(t.excluded, []),
        program:    json.parse<{ day: number; title: string; text: string }[]>(t.program, []),
        themes:     json.parse<string[]>(t.themes, []),
        durationNights: t.durationNights,
        hotelStars: t.hotelStars,
        meal: t.meal,
        price: t.price,
        oldPrice: t.oldPrice ?? undefined,
        rating: live.rating,
        reviews: live.reviews,
        badge: t.badge === "ai" ? undefined : (t.badge ?? undefined),
        emoji: t.emoji,
        gradient: t.gradient,
        imageCount: t.imageCount,
        popularity: t.popularity,
        createdAt: t.createdAt.toISOString().slice(0, 10),
      };
    }),
  });
});
