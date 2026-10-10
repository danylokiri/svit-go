/**
 * One-shot script that backfills `Tour.departures` for tours that don't
 * have any yet, and gives every Organizer a demo password (so the new
 * /organizer cabinet has something to log in against).
 *
 * Runs idempotently — skip already-populated rows.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Demo password — every seeded operator shares the same password so the
// reviewer can sign in as ANY of them from the cabinet UI. In production
// this would be a one-time invite link + password reset, never a shared
// secret.
const DEMO_PASSWORD = "operator2026";

function generateDepartures(durationNights: number): string[] {
  const now = new Date();
  // Start tomorrow, generate departures every ~12 days for the next 9 months.
  // Skips dates in the past (tours might have been seeded earlier).
  const out: string[] = [];
  const start = new Date(now.getTime() + 86_400_000);
  // Stagger spacing slightly so different tours have non-aligned dates
  // (more realistic than every tour starting on the 1st of the month).
  const stride = 10 + (durationNights % 7); // 10..16 days
  for (let i = 0; i < 18; i++) {
    const d = new Date(start.getTime() + i * stride * 86_400_000);
    out.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  return out;
}

async function main() {
  // 1. Backfill departures for tours missing them
  const tours = await prisma.tour.findMany({
    select: { id: true, slug: true, durationNights: true, departures: true },
  });
  let toursPatched = 0;
  for (const t of tours) {
    if (t.departures && t.departures.length > 2) continue;
    const dates = generateDepartures(t.durationNights);
    await prisma.tour.update({
      where: { id: t.id },
      data: { departures: JSON.stringify(dates) },
    });
    toursPatched++;
  }
  console.log(`✓ Tours patched with departures: ${toursPatched}/${tours.length}`);

  // 2. Give every organizer a demo password (if not already set)
  const organizers = await prisma.organizer.findMany({
    select: { id: true, slug: true, passwordHash: true },
  });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let opsPatched = 0;
  for (const o of organizers) {
    if (o.passwordHash) continue;
    await prisma.organizer.update({
      where: { id: o.id },
      data: { passwordHash: hash },
    });
    opsPatched++;
  }
  console.log(`✓ Organizers given demo password: ${opsPatched}/${organizers.length}`);
  console.log(`  Login as any organizer with: email=<their email>, password=${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
