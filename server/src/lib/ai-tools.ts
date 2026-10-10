/**
 * Tool definitions + executors for the AI chat endpoint.
 *
 * Architecture: instead of stuffing the entire catalog into the system prompt
 * on every request, we expose 4 functions the LLM can call. The LLM decides
 * which to call based on the user's question.
 *
 * Trade-off vs prompt-stuffing:
 *   + Shorter system prompt (~500 tokens vs ~6000)
 *   + LLM can chain calls (search → get details → get reviews)
 *   + Always-fresh data (no stale snapshot in prompt)
 *   – Higher latency (each tool call = extra round-trip)
 *
 * When the catalog grows past ~1000 tours, `searchTours` internals would be
 * swapped from straight SQL to vector retrieval — the LLM-facing API stays.
 */
import type { OpenAI } from "openai";
import { json, prisma } from "../db.js";
import { computeRating } from "./ratings.js";

// ---------------------------------------------------------------------------
//  Tool schema — fed to OpenAI in the `tools` parameter
// ---------------------------------------------------------------------------

export const aiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "searchTours",
      description:
        "Search the SvitGo tour catalog by filters. Returns up to 20 matching tours sorted by popularity. Use this whenever the user is browsing or asking for recommendations.",
      parameters: {
        type: "object",
        properties: {
          themes: {
            type: "array",
            description: "Tour themes the user is interested in.",
            items: {
              type: "string",
              enum: [
                "water", "mountains", "snow", "temples", "food", "market",
                "wellness", "adventure", "romantic", "family", "cities", "nature",
              ],
            },
          },
          country: { type: "string", description: "Filter by country, English name, e.g. Greece, Japan, Peru." },
          city:    { type: "string", description: "Filter by city, English name, e.g. Santorini, Kyoto." },
          region: {
            type: "string",
            description:
              "Geographic region or sub-region. Use this when the user names a region rather than a country (e.g. 'South America', 'Southeast Asia', 'Scandinavia'). Supported values: " +
              "'Europe', 'Asia', 'Africa', 'Americas', 'Oceania', 'Middle East', " +
              "'South America', 'North America', 'Central America', 'Caribbean', " +
              "'Southeast Asia', 'South Asia', 'East Asia', " +
              "'Western Europe', 'Southern Europe', 'Eastern Europe', 'Scandinavia', " +
              "'North Africa', 'Sub-Saharan Africa', 'Indian Ocean', 'Pacific Islands'.",
          },
          priceMin:  { type: "number", description: "Minimum price per person, EUR." },
          priceMax:  { type: "number", description: "Maximum price per person, EUR." },
          nightsMin: { type: "number", description: "Minimum number of nights." },
          nightsMax: { type: "number", description: "Maximum number of nights." },
          hotelStarsMin: { type: "number", description: "Minimum hotel star rating (3, 4 or 5)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTourDetails",
      description:
        "Get full information for ONE specific tour by slug — description, day-by-day program, what's included/not included, highlights, the organiser (name/type/years active/verified), the aggregate rating + total review count, and up to 3 recent review snippets. Call this when the user asks specifics about a single tour.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: 'Tour slug e.g. "santorini-romance-7"' },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getReviews",
      description:
        "Get the most recent reviews for a specific tour PLUS the aggregate rating and total review count from the database. Call when the user asks 'what do people think about X', 'is it good', 'any complaints', or wants social proof.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Tour slug" },
          limit: { type: "number", description: "How many recent reviews to return (default 5, max 10)." },
        },
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getActiveDeals",
      description:
        "Get all tours that currently have a discount (oldPrice set). Use when the user asks about sales, deals, or wants to save money.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---------------------------------------------------------------------------
//  Tool executors — what runs when LLM calls each tool
// ---------------------------------------------------------------------------

type ToolName = "searchTours" | "getTourDetails" | "getReviews" | "getActiveDeals";

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Only log in dev — in prod the line was firing once per tool call,
  // spamming Render free-tier logs and burning the daily quota.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[ai-tools] ${name}(${JSON.stringify(args)})`);
  }
  switch (name as ToolName) {
    case "searchTours":     return executeSearchTours(args);
    case "getTourDetails":  return executeGetTourDetails(args);
    case "getReviews":      return executeGetReviews(args);
    case "getActiveDeals":  return executeGetActiveDeals();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Common Ukrainian → English country/city aliases used as a safety net
 * when the LLM forgets to translate (system prompt asks it to do so, but
 * models occasionally slip). Keeps the tool resilient to multilingual chat.
 */
const PLACE_ALIASES: Record<string, string> = {
  // Countries
  "Іспанія": "Spain",        "Испания": "Spain",
  "Греція": "Greece",        "Греция": "Greece",
  "Італія": "Italy",         "Италия": "Italy",
  "Японія": "Japan",         "Япония": "Japan",
  "Чехія": "Czechia",        "Чехия": "Czechia",
  "Туреччина": "Turkey",     "Турция": "Turkey",
  "Хорватія": "Croatia",     "Хорватия": "Croatia",
  "Франція": "France",       "Франция": "France",
  "Німеччина": "Germany",    "Германия": "Germany",
  "Польща": "Poland",        "Польша": "Poland",
  "Грузія": "Georgia",       "Грузия": "Georgia",
  "Угорщина": "Hungary",     "Венгрия": "Hungary",
  "Австрія": "Austria",      "Австрия": "Austria",
  "Швейцарія": "Switzerland","Швейцария": "Switzerland",
  "Ісландія": "Iceland",     "Исландия": "Iceland",
  "Єгипет": "Egypt",         "Египет": "Egypt",
  "Марокко": "Morocco",
  "Йорданія": "Jordan",      "Иордания": "Jordan",
  "Ізраїль": "Israel",       "Израиль": "Israel",
  "Кенія": "Kenya",          "Кения": "Kenya",
  "Танзанія": "Tanzania",    "Танзания": "Tanzania",
  "Намібія": "Namibia",      "Намибия": "Namibia",
  "Південна Африка": "South Africa", "ПАР": "South Africa",
  "Індія": "India",          "Индия": "India",
  "Непал": "Nepal",          "Шрі-Ланка": "Sri Lanka", "Шри-Ланка": "Sri Lanka",
  "Таїланд": "Thailand",     "Таиланд": "Thailand",
  "Вʼєтнам": "Vietnam",      "В'єтнам": "Vietnam", "Вьетнам": "Vietnam",
  "Камбоджа": "Cambodia",
  "Індонезія": "Indonesia",  "Индонезия": "Indonesia",
  "Філіппіни": "Philippines","Филиппины": "Philippines",
  "Малайзія": "Malaysia",    "Малайзия": "Malaysia",
  "Сінгапур": "Singapore",   "Сингапур": "Singapore",
  "Гонконг": "Hong Kong",
  "ОАЕ": "United Arab Emirates", "ОАЭ": "United Arab Emirates", "Емірати": "United Arab Emirates",
  "США": "United States",    "Сполучені Штати": "United States",
  "Канада": "Canada",        "Мексика": "Mexico",
  "Куба": "Cuba",            "Бразилія": "Brazil", "Бразилия": "Brazil",
  "Аргентина": "Argentina",  "Перу": "Peru", "Чилі": "Chile", "Чили": "Chile",
  "Еквадор": "Ecuador",      "Эквадор": "Ecuador",
  "Колумбія": "Colombia",    "Колумбия": "Colombia",
  "Коста-Ріка": "Costa Rica","Коста-Рика": "Costa Rica",
  "Австралія": "Australia",  "Австралия": "Australia",
  "Нова Зеландія": "New Zealand", "Новая Зеландия": "New Zealand",
  "Фіджі": "Fiji",           "Фиджи": "Fiji",
  "Сейшели": "Seychelles",   "Маврикій": "Mauritius", "Маврикий": "Mauritius",
  "Мальдіви": "Maldives",    "Мальдивы": "Maldives",
  "Мадагаскар": "Madagascar","Руанда": "Rwanda", "Ботсвана": "Botswana",
  "Оман": "Oman",            "Бутан": "Bhutan",
  "Велика Британія": "United Kingdom", "Великобритания": "United Kingdom",
  "Іспанія (Балеари)": "Spain",
  // Common cities
  "Київ": "Kyiv",             "Львів": "Lviv",
  "Барселона": "Barcelona",   "Мадрид": "Madrid",
  "Прага": "Prague",          "Афіни": "Athens",
  "Стамбул": "Istanbul",      "Бангкок": "Bangkok",
  "Токіо": "Tokyo",           "Кіото": "Kyoto",
  "Каїр": "Cairo",            "Сінгапур місто": "Singapore",
  "Дубай": "Dubai",
};

/** Translate UA/RU place name → EN if known; otherwise return as-is. */
function normalizePlace(s: string): string {
  return PLACE_ALIASES[s.trim()] || s.trim();
}

/**
 * Region resolution table. Two flavours of value end up here:
 *   - Base regions ("Europe", "Asia", …) — match the `Tour.region` column
 *     directly, so we return a Prisma `{ region: X }` clause.
 *   - Sub-regions ("South America", "Southeast Asia", …) — DB doesn't store
 *     these, so we expand them to the actual list of countries in our
 *     catalog and return a `{ country: { in: [...] } }` clause.
 *
 * Keys are normalised (lower-case, trimmed). Country lists must stay in
 * sync with the seed catalog — when a country gets added in a new sub-region,
 * extend the list here so the LLM can find it.
 */
const BASE_REGIONS = ["europe", "asia", "africa", "americas", "oceania", "middle east"] as const;

const REGION_BASE_LABEL: Record<string, string> = {
  "europe": "Europe",
  "asia": "Asia",
  "africa": "Africa",
  "americas": "Americas",
  "oceania": "Oceania",
  "middle east": "Middle East",
  // Common aliases the model might generate
  "north america region": "Americas",
  "south america region": "Americas",
};

const SUBREGION_COUNTRIES: Record<string, string[]> = {
  // Americas sub-divisions
  "south america":   ["Argentina", "Brazil", "Chile", "Colombia", "Ecuador", "Peru"],
  "north america":   ["Canada", "United States", "Mexico"],
  "central america": ["Costa Rica", "Mexico"],
  "caribbean":       ["Cuba"],
  "latin america":   ["Argentina", "Brazil", "Chile", "Colombia", "Costa Rica", "Cuba", "Ecuador", "Mexico", "Peru"],

  // Asia sub-divisions
  "southeast asia":  ["Cambodia", "Indonesia", "Laos", "Malaysia", "Philippines", "Singapore", "Thailand", "Vietnam"],
  "south asia":      ["Bhutan", "India", "Maldives", "Nepal", "Sri Lanka"],
  "east asia":       ["Hong Kong", "Japan", "South Korea"],

  // Europe sub-divisions
  "western europe":  ["Austria", "France", "Germany", "Netherlands", "Switzerland", "United Kingdom"],
  "southern europe": ["Croatia", "Greece", "Italy", "Portugal", "Slovenia", "Spain"],
  "eastern europe":  ["Czechia", "Hungary", "Poland"],
  "scandinavia":     ["Denmark", "Iceland", "Norway"],
  "nordics":         ["Denmark", "Iceland", "Norway"],
  "northern europe": ["Denmark", "Iceland", "Norway", "United Kingdom"],

  // Africa sub-divisions
  "north africa":         ["Egypt", "Morocco"],
  "sub-saharan africa":   ["Botswana", "Kenya", "Madagascar", "Namibia", "Rwanda", "South Africa", "Tanzania"],
  "east africa":          ["Kenya", "Madagascar", "Rwanda", "Tanzania"],
  "southern africa":      ["Botswana", "Namibia", "South Africa"],

  // Cross-region groupings travellers commonly use
  "indian ocean":     ["Madagascar", "Maldives", "Mauritius", "Seychelles"],
  "pacific islands":  ["Fiji", "French Polynesia"],
  "polynesia":        ["Fiji", "French Polynesia"],
};

/**
 * Resolve a free-form region string into a Prisma where-clause fragment.
 * Returns `null` when the value is empty/unknown — caller should ignore it
 * and just let the other filters narrow the result.
 */
function resolveRegionFilter(raw: string): { region: string } | { country: { in: string[] } } | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (REGION_BASE_LABEL[key]) return { region: REGION_BASE_LABEL[key] };
  if (SUBREGION_COUNTRIES[key]) return { country: { in: SUBREGION_COUNTRIES[key] } };
  // Last-ditch fuzzy match — strip "south "/"central " etc. and retry. Helps
  // when the model adds modifiers like "central southern europe".
  for (const k of Object.keys(SUBREGION_COUNTRIES)) {
    if (key.includes(k) || k.includes(key)) return { country: { in: SUBREGION_COUNTRIES[k] } };
  }
  for (const base of BASE_REGIONS) {
    if (key.includes(base)) return { region: REGION_BASE_LABEL[base] };
  }
  return null;
}

async function executeSearchTours(args: Record<string, unknown>) {
  // status:"active" guards against the AI surfacing pending / rejected /
  // disabled tours — previous version had no status filter, so the LLM
  // could (and did, during pilot user testing) recommend tours that
  // weren't supposed to be public. imageCount:>0 keeps it consistent
  // with the public catalog and avoids placeholder-only cards.
  const where: Record<string, unknown> = { imageCount: { gt: 0 }, status: "active" };

  // Safety net: if the model passed a UA/RU name despite the system prompt
  // asking for English, translate via PLACE_ALIASES before querying.
  const rawCountry = typeof args.country === "string" ? normalizePlace(args.country) : undefined;
  const rawCity    = typeof args.city    === "string" ? normalizePlace(args.city)    : undefined;
  const rawRegion  = typeof args.region  === "string" ? args.region                  : undefined;

  // Tolerant matching: if the LLM put a city name into `country` (e.g. Prague),
  // try OR(country, city) so we still find it.
  if (rawCountry && rawCity) {
    where.AND = [
      { OR: [{ country: rawCountry }, { city: rawCountry }] },
      { OR: [{ country: rawCity },    { city: rawCity }] },
    ];
  } else if (rawCountry) {
    where.OR = [{ country: rawCountry }, { city: rawCountry }];
  } else if (rawCity) {
    where.OR = [{ city: rawCity }, { country: rawCity }];
  } else if (rawRegion) {
    // Only apply region when no country/city was passed. A specific country
    // is always more useful than the region it belongs to, so it wins.
    const regionFilter = resolveRegionFilter(rawRegion);
    if (regionFilter) Object.assign(where, regionFilter);
  }

  const priceCond: Record<string, number> = {};
  if (typeof args.priceMin === "number") priceCond.gte = args.priceMin;
  if (typeof args.priceMax === "number") priceCond.lte = args.priceMax;
  if (Object.keys(priceCond).length) where.price = priceCond;

  const nightsCond: Record<string, number> = {};
  if (typeof args.nightsMin === "number") nightsCond.gte = args.nightsMin;
  if (typeof args.nightsMax === "number") nightsCond.lte = args.nightsMax;
  if (Object.keys(nightsCond).length) where.durationNights = nightsCond;

  if (typeof args.hotelStarsMin === "number") {
    where.hotelStars = { gte: args.hotelStarsMin };
  }

  let rows = await prisma.tour.findMany({
    where,
    orderBy: { popularity: "desc" },
    take: 30,
  });

  // Themes filter happens in-memory (JSON column)
  if (Array.isArray(args.themes) && args.themes.length > 0) {
    const wanted = args.themes as string[];
    rows = rows.filter((t) => {
      const tt = json.parse<string[]>(t.themes, []);
      return tt.some((th) => wanted.includes(th));
    });
  }

  return {
    count: rows.length,
    tours: rows.slice(0, 20).map((t) => ({
      slug: t.slug,
      country: t.country,
      city: t.city,
      title: t.title,
      themes: json.parse<string[]>(t.themes, []),
      price: t.price,
      oldPrice: t.oldPrice ?? undefined,
      stars: t.hotelStars,
      meal: t.meal,
      nights: t.durationNights,
      shortDescription: t.shortDescription,
    })),
  };
}

async function executeGetTourDetails(args: Record<string, unknown>) {
  if (typeof args.slug !== "string") return { error: "slug is required" };
  const t = await prisma.tour.findUnique({
    where: { slug: args.slug },
    include: {
      organizer: { select: { name: true, type: true, yearsActive: true, verified: true } },
    },
  });
  if (!t) return { error: "Tour not found" };

  // Live rating + 3 most-recent reviews so the LLM has social-proof signal
  // without a second tool round-trip. NOTE: contact details (email / phone /
  // whatsapp) are intentionally NOT exposed — those belong on the "Contact
  // organiser" button, never in chat text (PII would leak into screenshots
  // and sessionStorage transcripts).
  const live = await computeRating(t.id);
  const recent = await prisma.review.findMany({
    where: { tourId: t.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return {
    slug: t.slug,
    country: t.country,
    city: t.city,
    region: t.region,
    title: t.title,
    description: t.description,
    highlights: json.parse<string[]>(t.highlights, []),
    included:   json.parse<string[]>(t.included, []),
    excluded:   json.parse<string[]>(t.excluded, []),
    program:    json.parse<unknown>(t.program, []),
    themes:     json.parse<string[]>(t.themes, []),
    price: t.price,
    oldPrice: t.oldPrice ?? undefined,
    stars: t.hotelStars,
    meal: t.meal,
    nights: t.durationNights,
    organizer: t.organizer ?? null,
    rating: live.reviews > 0 ? { average: live.rating, totalCount: live.reviews } : null,
    recentReviews: recent.map((r) => ({
      reviewer: r.user.name.split(/\s+/)[0],
      rating: r.rating,
      title: r.title,
      body: r.body.length > 240 ? r.body.slice(0, 240) + "…" : r.body,
      date: r.createdAt.toISOString().slice(0, 10),
    })),
  };
}

async function executeGetReviews(args: Record<string, unknown>) {
  if (typeof args.slug !== "string") return { error: "slug is required" };
  const t = await prisma.tour.findUnique({ where: { slug: args.slug } });
  if (!t) return { error: "Tour not found" };

  const limit = typeof args.limit === "number"
    ? Math.max(1, Math.min(10, Math.trunc(args.limit)))
    : 5;

  // totalCount comes from a separate count() — without this we used to
  // return `count: reviews.length` which lied to the LLM whenever there
  // were more reviews than the page size. With ~20 reviews and limit=5 the
  // model thought "only 5 people reviewed this" and would say so.
  const [reviews, totalCount, live] = await Promise.all([
    prisma.review.findMany({
      where: { tourId: t.id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.review.count({ where: { tourId: t.id } }),
    computeRating(t.id),
  ]);

  if (totalCount === 0) {
    return { totalCount: 0, rating: null, reviews: [], note: "No reviews yet." };
  }
  return {
    totalCount,
    rating: live.rating, // 0–5
    reviews: reviews.map((r) => ({
      reviewer: r.user.name.split(/\s+/)[0],
      rating: r.rating,
      title: r.title,
      body: r.body,
      date: r.createdAt.toISOString().slice(0, 10),
    })),
  };
}

async function executeGetActiveDeals() {
  const rows = await prisma.tour.findMany({
    where: { oldPrice: { not: null }, imageCount: { gt: 0 }, status: "active" },
    orderBy: { popularity: "desc" },
    take: 15,
  });
  return {
    count: rows.length,
    tours: rows.map((t) => ({
      slug: t.slug,
      country: t.country,
      city: t.city,
      title: t.title,
      price: t.price,
      oldPrice: t.oldPrice!,
      discountPercent: Math.round(100 - (t.price / t.oldPrice!) * 100),
      themes: json.parse<string[]>(t.themes, []),
    })),
  };
}
