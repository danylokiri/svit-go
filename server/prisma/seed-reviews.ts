/**
 * Attaches reviews + photos to tours from `data/reviews.json`.
 *
 *   npm run db:seed:reviews
 *
 * Reads `data/reviews.json` (array of review objects). For each entry:
 *   - finds the tour by slug
 *   - creates a past Booking for the assigned user (u1..u4)
 *   - creates a Review with rating/title/body and photos = ["/reviews/review-N.jpg"]
 *
 * Existing reviews (created by `seed.ts` for the base 12 tours) are kept as-is.
 *
 * Photo files are expected at `web/public/reviews/review-{n}.jpg`. If they're
 * not yet generated, the review still saves — the UI shows a broken image
 * placeholder, but everything else (rating, text, attribution) works.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const prisma = new PrismaClient();

interface IncomingReview {
  n: number;
  tourSlug: string;
  userKey: "u1" | "u2" | "u3" | "u4";
  rating: 1 | 2 | 3 | 4 | 5;
  title: string;
  body: string;
  photoPrompt: string; // not stored — only used by image-gen agent
}

const USER_EMAILS: Record<IncomingReview["userKey"], string> = {
  u1: "olena@example.com",
  u2: "marko@example.com",
  u3: "iryna@example.com",
  u4: "andriy@example.com",
};

async function main() {
  const file = process.argv[2] || "./data/reviews.json";
  const abs = resolve(process.cwd(), file);
  console.log(`→ reading ${abs}`);
  const reviews = JSON.parse(readFileSync(abs, "utf-8")) as IncomingReview[];

  if (!Array.isArray(reviews)) {
    throw new Error("JSON root must be an array of review objects.");
  }
  console.log(`→ ${reviews.length} reviews in file`);

  // Pre-load users by email
  const userIdByKey = new Map<IncomingReview["userKey"], number>();
  for (const [k, email] of Object.entries(USER_EMAILS) as [IncomingReview["userKey"], string][]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      console.warn(`! user "${email}" (${k}) not found — run \`npm run db:seed\` first`);
      continue;
    }
    userIdByKey.set(k, u.id);
  }

  let created = 0;
  let skipped = 0;
  for (const r of reviews) {
    const userId = userIdByKey.get(r.userKey);
    if (!userId) { skipped++; continue; }

    const tour = await prisma.tour.findUnique({ where: { slug: r.tourSlug } });
    if (!tour) {
      console.warn(`! tour "${r.tourSlug}" not found — skipping review #${r.n}`);
      skipped++;
      continue;
    }

    // Spread reviews 30..360 days back so the dates feel real
    const daysAgo = 30 + ((r.n * 17) % 330);
    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    // Idempotency: skip if a review for this user+tour already exists
    const existing = await prisma.review.findFirst({
      where: { userId, tourId: tour.id },
    });
    if (existing) { skipped++; continue; }

    const booking = await prisma.booking.create({
      data: {
        userId, tourId: tour.id, totalPrice: tour.price,
        travelers: JSON.stringify([{ firstName: "—", lastName: "—" }]),
        contact: JSON.stringify({ email: "—", phone: "—" }),
        addOns: JSON.stringify([]),
        status: "completed",
        startDate,
      },
    });

    await prisma.review.create({
      data: {
        userId, tourId: tour.id, bookingId: booking.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        photos: JSON.stringify([`/reviews/review-${r.n}.jpg`]),
      },
    });
    created++;
  }

  console.log(`\n✓ done. created ${created}, skipped ${skipped}`);
}

main()
  .catch((e) => { console.error("\n✗ seeding failed:\n", e?.message ?? e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
