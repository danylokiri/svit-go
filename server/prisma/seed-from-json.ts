/**
 * Bulk seed tours from a JSON file.
 *
 *   npm run db:seed:json -- ./data/tours.json
 *
 * The JSON is an array of tour objects. Required fields and shape match
 * `data/tours.example.json` — see it for a complete example.
 *
 * Fields prefixed with "_" (like "_imagePrompts") are stripped before insert
 * and are only used by the content-generation agent.
 *
 * Existing tours with the same slug are upserted (updated) — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

interface IncomingTour {
  slug: string;
  country: string;
  city: string;
  region: string;
  title: string;
  shortDescription: string;
  description: string;
  highlights: string[];
  included: string[];
  excluded: string[];
  program: { day: number; title: string; text: string }[];
  themes: string[];
  durationNights: number;
  hotelStars: number;
  meal: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviews: number;
  badge?: "ai" | "hot" | "new";
  emoji: string;
  gradient: string;
  imageCount?: number;
  popularity?: number;
  [k: string]: unknown;
}

function ensure(t: Partial<IncomingTour>, field: keyof IncomingTour, label: string) {
  if (t[field] === undefined || t[field] === null) {
    throw new Error(`Tour "${t.slug ?? "?"}" missing required field: ${label}`);
  }
}

function validate(t: IncomingTour) {
  for (const f of [
    "slug","country","city","region","title","shortDescription","description",
    "highlights","included","excluded","program","themes","durationNights",
    "hotelStars","meal","price","rating","reviews","emoji","gradient",
  ] as const) {
    ensure(t, f, f);
  }
  if (!/^[a-z0-9-]+$/.test(t.slug)) {
    throw new Error(`Tour "${t.slug}" — slug must be lowercase-kebab-case ([a-z0-9-]+).`);
  }
}

async function main() {
  const file = process.argv[2] || "./data/tours.json";
  const abs = resolve(process.cwd(), file);
  console.log(`→ reading ${abs}`);
  const raw = readFileSync(abs, "utf-8");
  const tours = JSON.parse(raw) as IncomingTour[];

  if (!Array.isArray(tours)) {
    throw new Error("JSON root must be an array of tour objects.");
  }

  console.log(`→ ${tours.length} tour${tours.length === 1 ? "" : "s"} in file`);

  // Build organizer-slug → id lookup once
  const orgRows = await prisma.organizer.findMany({ select: { id: true, slug: true } });
  const orgIdBySlug = new Map(orgRows.map((o) => [o.slug, o.id]));
  console.log(`→ ${orgRows.length} organizers in DB (used for organizerSlug lookup)`);

  let created = 0;
  let updated = 0;
  let withoutOrg = 0;
  for (const t of tours) {
    validate(t);

    let organizerId: number | null = null;
    const orgSlug = (t as { organizerSlug?: string }).organizerSlug;
    if (orgSlug) {
      const id = orgIdBySlug.get(orgSlug);
      if (id == null) {
        console.warn(`  ! tour "${t.slug}" references unknown organizerSlug "${orgSlug}" — leaving organizer empty`);
        withoutOrg++;
      } else {
        organizerId = id;
      }
    } else {
      withoutOrg++;
    }

    const data = {
      slug: t.slug,
      country: t.country,
      city: t.city,
      region: t.region,
      title: t.title,
      shortDescription: t.shortDescription,
      description: t.description,
      highlights: JSON.stringify(t.highlights),
      included:   JSON.stringify(t.included),
      excluded:   JSON.stringify(t.excluded),
      program:    JSON.stringify(t.program),
      themes:     JSON.stringify(t.themes),
      durationNights: t.durationNights,
      hotelStars: t.hotelStars,
      meal: t.meal,
      price: t.price,
      oldPrice: t.oldPrice ?? null,
      rating: t.rating,
      reviewsCount: t.reviews,
      badge: t.badge ?? null,
      emoji: t.emoji,
      gradient: t.gradient,
      imageCount: t.imageCount ?? 0,
      popularity: t.popularity ?? 50,
      organizerId,
    };

    const existing = await prisma.tour.findUnique({ where: { slug: t.slug } });
    if (existing) {
      await prisma.tour.update({ where: { slug: t.slug }, data });
      updated++;
    } else {
      await prisma.tour.create({ data });
      created++;
    }
  }

  console.log(`\n✓ done. created ${created}, updated ${updated}, without organizer ${withoutOrg}`);
}

main()
  .catch((e) => { console.error("\n✗ seeding failed:\n", e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
