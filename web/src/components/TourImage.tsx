import { cn, tourHero, tourHeroSrcSet } from "@/lib/utils";

interface Props {
  slug: string;
  imageCount: number;
  alt: string;
  /** Tells the browser which variant to pick for the rendered size. */
  sizes?: string;
  className?: string;
  /** Hint browser — only "eager" for above-the-fold heroes. */
  loading?: "lazy" | "eager";
}

/**
 * Responsive tour hero image — `<picture>` with WebP `srcSet` plus a JPG
 * fallback. Modern browsers (99%+) pick the WebP variant; ancient ones
 * use the JPG. The 400/800/1920 widths match the variants produced by
 * `scripts/optimize-images.mjs`.
 *
 * Why a component (not just inline): we use the same picture markup in
 * TourCard, TourPage hero, BookingPage thumb, ChatPage avatar — keeping
 * the srcSet/sizes recipe in one place means the optimisation logic
 * lives ONCE.
 */
export default function TourImage({
  slug,
  imageCount,
  alt,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  className,
  loading = "lazy",
}: Props) {
  const set = tourHeroSrcSet(slug, imageCount);
  if (!set) {
    // No image uploaded yet → return null; parent shows emoji+gradient.
    return null;
  }
  return (
    <picture>
      <source type="image/webp" srcSet={set.webp} sizes={sizes} />
      <img
        src={tourHero(slug, imageCount) ?? set.jpgFallback}
        alt={alt}
        loading={loading}
        decoding="async"
        className={cn("h-full w-full object-cover", className)}
      />
    </picture>
  );
}
