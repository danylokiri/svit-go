/**
 * Permanently delete tours that have no images yet.
 * Use when image-generation budget is exhausted and you'd rather not see
 * placeholder-emoji tours at all.
 *
 *   npm run db:cleanup:imageless
 *
 * Cascade in schema handles related Booking / SavedTour / Review rows.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.tour.findMany({
    where: { imageCount: 0 },
    select: { id: true, slug: true, title: true },
  });

  if (targets.length === 0) {
    console.log("✓ no image-less tours found — nothing to do");
    return;
  }

  console.log(`Found ${targets.length} tour(s) without images:`);
  for (const t of targets) console.log(`  · ${t.slug}  —  ${t.title}`);

  const tourIds = targets.map((t) => t.id);

  // Count related rows for the log line
  const [reviews, bookings, saved] = await Promise.all([
    prisma.review.count({ where: { tourId: { in: tourIds } } }),
    prisma.booking.count({ where: { tourId: { in: tourIds } } }),
    prisma.savedTour.count({ where: { tourId: { in: tourIds } } }),
  ]);
  if (reviews || bookings || saved) {
    console.log(
      `\nCascade will also drop: ${reviews} review(s), ${bookings} booking(s), ${saved} saved entry(ies).`
    );
  }

  // Cascade is declared in schema (onDelete: Cascade) so a single tour.delete
  // does the right thing. Use deleteMany for a single round-trip.
  const result = await prisma.tour.deleteMany({ where: { imageCount: 0 } });
  console.log(`\n✓ deleted ${result.count} tour(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
