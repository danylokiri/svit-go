import { describe, it, expect } from "vitest";
import { computeMatch, pickBadge } from "./match.js";

describe("computeMatch", () => {
  it("returns base score 50 with non-personal signals for anonymous user", () => {
    const result = computeMatch({
      tourPrice: 1000,
      tourThemes: ["wellness", "water"],
      tourMeal: "Half board",
      tourStars: 5,
      tourDuration: 7,
      user: null,
    });
    expect(result.personal).toBe(false);
    expect(result.score).toBe(50);
    // 5★ hotel + wellness signals
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("boosts score when user themes overlap", () => {
    const result = computeMatch({
      tourPrice: 1200,
      tourThemes: ["wellness", "water", "food"],
      tourMeal: "Breakfast",
      tourStars: 4,
      tourDuration: 7,
      user: {
        budgetFrom: 1000,
        budgetTo: 1500,
        favThemes: ["wellness", "water"],
        companion: "partner",
      },
    });
    // 50 base + 2*12 themes + 15 budget + 3 duration = 92
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.personal).toBe(true);
    expect(result.signals.some((s) => s.includes("themes"))).toBe(true);
  });

  it("penalises score when over budget", () => {
    const result = computeMatch({
      tourPrice: 3000,
      tourThemes: ["water"],
      tourMeal: "Breakfast",
      tourStars: 3,
      tourDuration: 7,
      user: {
        budgetFrom: 500,
        budgetTo: 1000,  // 3000 is 2x over
        favThemes: [],
        companion: null,
      },
    });
    expect(result.score).toBeLessThan(50);
  });

  it("clamps score to 0..100", () => {
    const r = computeMatch({
      tourPrice: 500,
      tourThemes: ["a","b","c","d","e","f","g","h","i","j"],
      tourMeal: "All inclusive",
      tourStars: 5,
      tourDuration: 7,
      user: {
        budgetFrom: 0,
        budgetTo: 5000,
        favThemes: ["a","b","c","d","e","f","g","h","i","j"],
        companion: "partner",
      },
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("rewards partner companion + romantic tour", () => {
    const r = computeMatch({
      tourPrice: 1000,
      tourThemes: ["romantic"],
      tourMeal: "Breakfast",
      tourStars: 4,
      tourDuration: 7,
      user: {
        budgetFrom: null,
        budgetTo: null,
        favThemes: [],
        companion: "partner",
      },
    });
    expect(r.signals).toContain("works well for two");
  });
});

describe("pickBadge", () => {
  it("returns 'ai' when matchScore >= 80", () => {
    expect(pickBadge({ manualBadge: null, matchScore: 85, price: 1000, oldPrice: null })).toBe("ai");
  });

  it("does NOT return 'ai' when matchScore < 80", () => {
    expect(pickBadge({ manualBadge: null, matchScore: 75, price: 1000, oldPrice: null })).toBe(null);
  });

  it("returns 'hot' from manual override", () => {
    expect(pickBadge({ manualBadge: "hot", matchScore: 60, price: 1000, oldPrice: null })).toBe("hot");
  });

  it("returns 'hot' automatically when discount >= 15%", () => {
    // price 850, oldPrice 1000 → 15% off
    expect(pickBadge({ manualBadge: null, matchScore: 50, price: 850, oldPrice: 1000 })).toBe("hot");
  });

  it("does NOT return 'hot' for small discounts", () => {
    // 10% off
    expect(pickBadge({ manualBadge: null, matchScore: 50, price: 900, oldPrice: 1000 })).toBe(null);
  });

  it("ignores manual 'ai' badge — AI is personal-only", () => {
    expect(pickBadge({ manualBadge: "ai", matchScore: null, price: 1000, oldPrice: null })).toBe(null);
  });

  it("returns 'new' from manual override", () => {
    expect(pickBadge({ manualBadge: "new", matchScore: 50, price: 1000, oldPrice: null })).toBe("new");
  });

  it("ai takes precedence over hot", () => {
    // matchScore=85 AND discount → should be ai
    expect(pickBadge({ manualBadge: "hot", matchScore: 85, price: 850, oldPrice: 1000 })).toBe("ai");
  });
});
