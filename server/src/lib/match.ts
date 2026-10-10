/**
 * Shared scoring logic used by:
 *   - /api/ai/explain-pick       — full reasoning + signals
 *   - /api/tours serialization   — picks "ai" badge when score is high enough
 *
 * Keeping this in one place means the badge on a card and the explanation on
 * the tour page always agree.
 */

export interface MatchInput {
  tourPrice: number;
  tourThemes: string[];
  tourMeal: string;
  tourStars: number;
  tourDuration: number;
  user: {
    budgetFrom: number | null;
    budgetTo: number | null;
    favThemes: string[];
    companion: string | null;
  } | null;
}

export interface MatchResult {
  /** 0–100 */
  score: number;
  /** human-readable reasons that contributed to the score */
  signals: string[];
  /** false when user is null (no profile to compare against) */
  personal: boolean;
}

export function computeMatch(i: MatchInput): MatchResult {
  const signals: string[] = [];
  let score = 50;

  if (!i.user) {
    if (i.tourStars >= 5) signals.push(`${i.tourStars}★ hotel with ${i.tourMeal.toLowerCase()}`);
    if (i.tourThemes.includes("romantic"))  signals.push("popular with couples");
    if (i.tourThemes.includes("family"))    signals.push("family-friendly setup");
    if (i.tourThemes.includes("wellness"))  signals.push("strong wellness focus");
    if (i.tourThemes.includes("adventure")) signals.push("active, not the resort-only kind");
    return { score, signals, personal: false };
  }

  const u = i.user;

  const matchingThemes = u.favThemes.filter((t) => i.tourThemes.includes(t));
  if (matchingThemes.length > 0) {
    score += matchingThemes.length * 12;
    signals.push(`matches your favourite themes (${matchingThemes.join(", ")})`);
  }

  if (u.budgetTo != null) {
    if (i.tourPrice <= u.budgetTo) {
      score += 15;
      signals.push(`within your €${u.budgetFrom ?? 0}–€${u.budgetTo} budget`);
    } else if (i.tourPrice <= u.budgetTo + 200) {
      score += 5;
      signals.push("just slightly above your budget ceiling");
    } else {
      score -= 10;
      signals.push("above your usual budget — but might be worth it");
    }
  }

  if (u.companion === "partner" && i.tourThemes.includes("romantic")) {
    score += 12;
    signals.push("works well for two");
  } else if (u.companion === "family" && i.tourThemes.includes("family")) {
    score += 12;
    signals.push("family-friendly");
  } else if (u.companion === "solo" && i.tourThemes.includes("adventure")) {
    score += 8;
    signals.push("good for solo travellers");
  } else if (u.companion === "friends" && (i.tourThemes.includes("food") || i.tourThemes.includes("cities"))) {
    score += 8;
    signals.push("works for groups of friends");
  }

  if (i.tourStars >= 5) {
    score += 5;
    signals.push(`${i.tourStars}★ hotel, ${i.tourMeal.toLowerCase()}`);
  }
  if (i.tourDuration >= 5 && i.tourDuration <= 9) {
    score += 3;
    signals.push("comfortable trip length");
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    signals,
    personal: true,
  };
}

/**
 * Decide which badge (if any) should be shown on a tour card.
 *  - "ai"  → high personal match score (≥80). Never shown to anon users.
 *  - "hot" → manual override OR auto: has oldPrice with ≥15% discount.
 *  - "new" → manual override only (recency-auto is unreliable from a seed).
 *
 * Manual `tour.badge = "ai"` is intentionally ignored — the AI badge is meant
 * to be personalised, not a marketing tag.
 */
export function pickBadge(args: {
  manualBadge: string | null;
  matchScore: number | null;       // null when anon
  price: number;
  oldPrice: number | null;
}): "ai" | "hot" | "new" | null {
  // Personal AI badge wins
  if (args.matchScore != null && args.matchScore >= 80) return "ai";

  // Hot: manual or auto by discount
  if (args.manualBadge === "hot") return "hot";
  if (args.oldPrice && args.price / args.oldPrice <= 0.85) return "hot";

  // New: manual override only
  if (args.manualBadge === "new") return "new";

  return null;
}
