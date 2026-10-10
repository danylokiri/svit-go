/**
 * Lightweight skeleton placeholders for loading states.
 *
 * Replaces plain "Loading..." text — using glass-tinted cards with a slow
 * pulse, so the page keeps its layout while data is in flight. No external
 * deps, no JS animation; pure Tailwind `animate-pulse`.
 */
import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  /** Full-width by default; pass exact size via className. */
  rounded?: "sm" | "md" | "lg" | "pill" | "glass";
}

export function Skeleton({ className, rounded = "md" }: SkeletonProps) {
  const radius = {
    sm: "rounded",
    md: "rounded-md",
    lg: "rounded-lg",
    pill: "rounded-pill",
    glass: "rounded-glass",
  }[rounded];
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse bg-gradient-to-r from-white/40 via-white/60 to-white/40 bg-[length:200%_100%]",
        radius,
        className
      )}
    />
  );
}

/** Tour card placeholder — matches TourCard layout so the grid doesn't
 *  jump when the real data arrives. */
export function TourCardSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-glass">
      <Skeleton className="h-48 w-full" rounded="sm" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}

/** Booking row placeholder for the account page. */
export function BookingRowSkeleton() {
  return (
    <div className="glass flex flex-col gap-3 overflow-hidden rounded-glass p-3 sm:flex-row sm:gap-4">
      <Skeleton className="h-32 w-full sm:w-40 sm:shrink-0" rounded="glass" />
      <div className="flex flex-1 flex-col gap-3 py-2 pr-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-2/5" />
        <div className="mt-auto flex items-center justify-between pt-2">
          <Skeleton className="h-6 w-20" rounded="pill" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
    </div>
  );
}

/** Grid of tour-card skeletons — drop in where you'd render a tour grid. */
export function TourGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <TourCardSkeleton key={i} />
      ))}
    </div>
  );
}
