/**
 * AI compare endpoint — given a list of tour slugs, returns a per-tour
 * pros/cons + "best for" summary that the ComparePage shows below each
 * column.
 *
 * Single LLM call analyses ALL tours together so the answers can reference
 * each other ("X is cheaper than Y but Y has more days"). Falls back to
 * deterministic heuristics if the LLM is disabled or fails.
 *
 * Response shape:
 *   {
 *     analyses: Array<{
 *       slug: string,
 *       pros: string[],     // 2-4 short bullet points
 *       cons: string[],     // 1-3 short bullets
 *       bestFor: string,    // one phrase, e.g. "couples on a tight budget"
 *     }>
 *   }
 */
import { Router } from "express";
import { z } from "zod";
import { json, prisma } from "../db.js";
import { type AuthedRequest } from "../middleware/auth.js";
import { llm } from "../lib/llm.js";
import { computeRatingsBatch } from "../lib/ratings.js";

export const aiCompareRouter = Router();

const schema = z.object({
  tourSlugs: z.array(z.string().min(1).max(80)).min(2).max(4),
  locale: z.enum(["en", "uk"]).optional().default("en"),
});

interface ToneAnalysis {
  slug: string;
  pros: string[];
  cons: string[];
  bestFor: string;
}

aiCompareRouter.post("/compare-analysis", async (req: AuthedRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { tourSlugs, locale } = parsed.data;

  const tours = await prisma.tour.findMany({
    where: { slug: { in: tourSlugs } },
    include: { organizer: true },
  });
  if (tours.length < 2) {
    res.status(404).json({ error: "need at least 2 valid tours" });
    return;
  }

  // Live rating + actual review count from the Review table — NEVER the
  // seed-time `t.rating` / `t.reviewsCount` columns, which are baseline
  // placeholders. A bug surfaced in user testing where the LLM cited
  // "528 reviews" for a tour that had zero real reviews because the
  // payload exposed the seed value.
  const liveRatings = await computeRatingsBatch(tours.map((t) => t.id));

  // PRE-COMPUTED comparison facts. We do the math here so the LLM
  // doesn't have to — and historically it gets price subtraction wrong
  // (e.g. claimed "more expensive by €500" for a tour that was actually
  // equal to one peer and €500 cheaper than another). With these
  // explicit fields the model just picks the right phrase.
  const prices = tours.map((t) => t.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minNights = Math.min(...tours.map((t) => t.durationNights));
  const maxNights = Math.max(...tours.map((t) => t.durationNights));
  const maxStars = Math.max(...tours.map((t) => t.hotelStars));

  // Compact, structured payload for the model. Includes enough textual
  // substance (shortDescription, included, highlights, program titles)
  // that pros/cons can be grounded in real content instead of guessed.
  const payload = tours.map((t) => {
    const live = liveRatings.get(t.id) ?? { rating: 0, reviews: 0 };
    const programArr = json.parse<{ day: number; title: string; text: string }[]>(t.program, []);
    return {
      slug: t.slug,
      title: t.title,
      country: t.country,
      city: t.city,
      price: t.price,
      // Pre-computed price relationships. RELATIVE-only — units in EUR.
      priceVsCheapest: t.price - minPrice,          // 0 if this IS cheapest
      priceVsPriciest: maxPrice - t.price,          // 0 if this IS priciest
      isCheapest: t.price === minPrice && minPrice !== maxPrice,
      isPriciest: t.price === maxPrice && minPrice !== maxPrice,
      isLongest: t.durationNights === maxNights && minNights !== maxNights,
      isShortest: t.durationNights === minNights && minNights !== maxNights,
      isHighestStars: t.hotelStars === maxStars && new Set(tours.map((x) => x.hotelStars)).size > 1,
      durationNights: t.durationNights,
      hotelStars: t.hotelStars,
      meal: t.meal,
      themes: json.parse<string[]>(t.themes, []),
      highlights: json.parse<string[]>(t.highlights, []),
      included: json.parse<string[]>(t.included, []),
      excluded: json.parse<string[]>(t.excluded, []),
      // Short copy gives the model real content to compare; full long
      // description would blow the context budget for 4 tours.
      shortDescription: t.shortDescription,
      programDayTitles: programArr.slice(0, 8).map((d) => d.title),
      ...(live.reviews > 0 ? { rating: live.rating, reviewsCount: live.reviews } : {}),
      departures: json.parse<string[]>(t.departures, []).slice(0, 6),
      organizer: t.organizer ? { name: t.organizer.name, yearsActive: t.organizer.yearsActive } : null,
    };
  });

  let analyses: ToneAnalysis[] | null = null;

  if (llm.enabled()) {
    const system = `You compare travel tours and produce per-tour pros/cons.
Output STRICT JSON, no prose, no markdown.

Per-tour fields you receive:
 - price, durationNights, hotelStars, meal, themes, highlights, included, excluded
 - shortDescription, programDayTitles (the tour's daily schedule)
 - priceVsCheapest: how many EUR MORE this tour costs than the cheapest in the set (0 if it IS the cheapest)
 - priceVsPriciest: how many EUR LESS this tour costs than the priciest (0 if it IS the priciest)
 - isCheapest / isPriciest / isLongest / isShortest / isHighestStars: pre-computed booleans
 - rating / reviewsCount: present ONLY if real reviews exist; otherwise OMIT entirely

CRITICAL — Math rules:
 1. NEVER compute your own price differences. Use the pre-computed numbers.
    - If isCheapest=true, say "Cheapest of the {N}" (DO NOT add a €-delta).
    - If isPriciest=true, say "Most expensive (€{priceVsCheapest} more than the cheapest)".
    - For middle-priced tours, you may say "Mid-range price" or compare to a specific named peer — but ONLY using priceVsCheapest / priceVsPriciest values from THAT tour's record. NEVER subtract prices yourself.
 2. If two tours share the same exact price, never say one is more/less expensive than the other.
 3. Same rule for duration / stars — use the boolean flags, don't reinvent ordering.

Output rules:
 - One entry per tour, keyed by slug.
 - 2-4 pros — concrete, grounded ONLY in the payload (e.g. "Includes a guided day in Petra" if "Petra" appears in highlights/program/description; "Most expensive — €620 above the cheapest" if isPriciest=true and priceVsCheapest=620).
 - 1-3 cons — honest trade-offs.
 - "bestFor": one short phrase describing the ideal traveller type for THIS tour relative to the others (max 8 words).
 - Language: ${locale === "uk" ? "Ukrainian" : "English"}.
 - NEVER invent details not present in the payload.
 - NEVER fabricate review counts, perfume classes, blue-domed glamping, etc. unless they appear verbatim in highlights / included / programDayTitles / shortDescription.

Schema:
{
  "analyses": [
    { "slug": "...", "pros": ["...", "..."], "cons": ["..."], "bestFor": "..." }
  ]
}`;
    const userMsg = `Compare these tours:\n${JSON.stringify(payload)}`;
    const raw = await llm.chat({
      system,
      user: userMsg,
      json: true,
      rateKey: { userId: req.userId, ip: req.ip },
    });
    if (raw) {
      try {
        const obj = JSON.parse(raw) as { analyses?: ToneAnalysis[] };
        if (Array.isArray(obj.analyses)) {
          // Filter to slugs we actually asked for + sanitise lengths so a
          // chatty model can't blow up the UI with wall-of-text bullets.
          analyses = obj.analyses
            .filter((a) => tourSlugs.includes(a.slug))
            .map((a) => ({
              slug: a.slug,
              pros: (a.pros ?? []).slice(0, 4).map((s) => String(s).slice(0, 140)),
              cons: (a.cons ?? []).slice(0, 3).map((s) => String(s).slice(0, 140)),
              bestFor: String(a.bestFor ?? "").slice(0, 80),
            }));
        }
      } catch {
        // Falls through to heuristic fallback below.
      }
    }
  }

  if (!analyses || analyses.length === 0) {
    analyses = heuristicFallback(payload, locale);
  }

  res.json({ analyses });
});

/**
 * Hand-coded fallback. Compares each tour's facets to the relative best/
 * worst in the set. No LLM, no creativity — just facts.
 */
function heuristicFallback(
  payload: Array<{
    slug: string; title: string; price: number; durationNights: number;
    hotelStars: number; meal: string;
    rating?: number; reviewsCount?: number;
    themes: string[]; departures: string[];
  }>,
  locale: "en" | "uk",
): ToneAnalysis[] {
  // Only numeric facets that always exist on every row are passed to min/max.
  // `rating` / `reviewsCount` are optional so we compute them defensively.
  const minPrice = Math.min(...payload.map((p) => p.price));
  const maxPrice = Math.max(...payload.map((p) => p.price));
  const minNights = Math.min(...payload.map((p) => p.durationNights));
  const maxNights = Math.max(...payload.map((p) => p.durationNights));
  const maxStars = Math.max(...payload.map((p) => p.hotelStars));
  const maxRating = Math.max(...payload.map((p) => p.rating ?? -Infinity));

  const T = locale === "uk"
    ? {
        cheapest: (d: number) => `Найдешевший варіант у порівнянні (на €${d} менше)`,
        longest:  (n: number) => `Найдовша подорож — ${n} ночей`,
        shortest: (n: number) => `Найкоротша подорож — ${n} ночей`,
        topStars: (s: number) => `Найвищий рівень готелю серед турів (${s}★)`,
        topRated: (r: number, n: number) => `Найкращий рейтинг (${r}/5, ${n} відгуків)`,
        priciest: (d: number) => `Найдорожчий варіант (на €${d} більше за найдешевший)`,
        noReviews: "Ще немає відгуків",
        allInclusive: "Включено все харчування",
        bestForBudget: "Тих, хто шукає бюджетний варіант",
        bestForLong:   "Тих, хто хоче довшу подорож",
        bestForShort:  "Швидкий формат для короткої відпустки",
        bestForLuxe:   "Тих, хто цінує комфорт готелю",
        bestForRated:  "Тих, для кого важлива репутація",
        bestForGeneral:"Збалансований варіант",
      }
    : {
        cheapest: (d: number) => `Cheapest in the comparison (€${d} less than the priciest)`,
        longest:  (n: number) => `Longest trip — ${n} nights`,
        shortest: (n: number) => `Shortest trip — only ${n} nights`,
        topStars: (s: number) => `Highest hotel tier (${s}★)`,
        topRated: (r: number, n: number) => `Top-rated (${r}/5 from ${n} reviews)`,
        priciest: (d: number) => `Priciest pick (€${d} above the cheapest)`,
        noReviews: "No reviews yet",
        allInclusive: "All meals included",
        bestForBudget: "Travellers on a tight budget",
        bestForLong:   "Travellers wanting a longer trip",
        bestForShort:  "A quick getaway",
        bestForLuxe:   "Travellers prioritising hotel comfort",
        bestForRated:  "Travellers who value proven quality",
        bestForGeneral:"A balanced overall pick",
      };

  return payload.map((p) => {
    const pros: string[] = [];
    const cons: string[] = [];
    let bestFor: string = T.bestForGeneral;

    if (p.price === minPrice && minPrice !== maxPrice) {
      pros.push(T.cheapest(maxPrice - minPrice));
      bestFor = T.bestForBudget;
    }
    if (p.durationNights === maxNights && maxNights !== minNights) {
      pros.push(T.longest(p.durationNights));
      if (bestFor === T.bestForGeneral) bestFor = T.bestForLong;
    }
    if (p.hotelStars === maxStars && maxStars > 3) {
      pros.push(T.topStars(p.hotelStars));
      if (bestFor === T.bestForGeneral) bestFor = T.bestForLuxe;
    }
    if (
      p.rating !== undefined &&
      p.reviewsCount !== undefined &&
      p.reviewsCount > 0 &&
      p.rating === maxRating
    ) {
      pros.push(T.topRated(p.rating, p.reviewsCount));
      if (bestFor === T.bestForGeneral) bestFor = T.bestForRated;
    }
    if (p.meal === "All inclusive") {
      pros.push(T.allInclusive);
    }

    if (p.price === maxPrice && minPrice !== maxPrice) {
      cons.push(T.priciest(maxPrice - minPrice));
    }
    if (p.durationNights === minNights && minNights !== maxNights) {
      cons.push(T.shortest(p.durationNights));
      if (bestFor === T.bestForGeneral) bestFor = T.bestForShort;
    }
    if (!p.reviewsCount) {
      cons.push(T.noReviews);
    }

    return { slug: p.slug, pros: pros.slice(0, 4), cons: cons.slice(0, 3), bestFor };
  });
}
