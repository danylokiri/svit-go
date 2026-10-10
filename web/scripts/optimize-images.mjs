/**
 * One-shot image optimisation script.
 *
 * For every JPG in public/tours/<slug>/, produces:
 *   - hero.webp           (max 1920w, q80)        — full-bleed hero
 *   - hero.w800.webp      (800w, q80)             — tablet/card hero
 *   - hero.w400.webp      (400w, q80)             — mobile card thumb
 *   - gallery-N.webp      (max 1600w, q80)
 *
 * Original .jpg files are kept untouched as fallback for browsers that
 * don't speak WebP (almost extinct in 2026, but cheap insurance).
 *
 * Run from web/:
 *   node scripts/optimize-images.mjs           # process tours that don't have WebP yet
 *   node scripts/optimize-images.mjs --force   # re-process all
 */
import { readdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = "public/tours";
const FORCE = process.argv.includes("--force");

const HERO_WIDTHS = [1920, 800, 400];
const GALLERY_WIDTH = 1600;
const QUALITY = 80;

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

async function processHero(slug, dir) {
  const src = join(dir, "hero.jpg");
  if (!(await exists(src))) return;
  for (const w of HERO_WIDTHS) {
    const suffix = w === 1920 ? "" : `.w${w}`;
    const dst = join(dir, `hero${suffix}.webp`);
    if (!FORCE && (await exists(dst))) continue;
    await sharp(src)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(dst);
    process.stdout.write(`  hero${suffix}.webp `);
  }
}

async function processGallery(slug, dir, files) {
  for (const f of files) {
    if (!/^gallery-\d+\.jpg$/.test(f)) continue;
    const src = join(dir, f);
    const dst = join(dir, f.replace(/\.jpg$/, ".webp"));
    if (!FORCE && (await exists(dst))) continue;
    await sharp(src)
      .resize({ width: GALLERY_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(dst);
    process.stdout.write(`  ${f.replace(/\.jpg$/, ".webp")} `);
  }
}

async function main() {
  const slugs = (await readdir(ROOT)).filter((s) => !s.startsWith("_"));
  console.log(`Found ${slugs.length} tour folders.`);

  let processed = 0;
  let skipped = 0;
  for (const slug of slugs) {
    const dir = join(ROOT, slug);
    const st = await stat(dir);
    if (!st.isDirectory()) continue;
    const files = await readdir(dir);
    const hasWebp = files.some((f) => f.endsWith(".webp"));
    if (hasWebp && !FORCE) {
      skipped++;
      continue;
    }
    process.stdout.write(`${slug}: `);
    await processHero(slug, dir);
    await processGallery(slug, dir, files);
    process.stdout.write("\n");
    processed++;
  }
  console.log(`\nDone. ${processed} processed, ${skipped} skipped (use --force to re-process).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
