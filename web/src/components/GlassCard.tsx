import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Three elevation tiers, in order of "how far above the page surface" they
 * read:
 *   default   — inline content panels (sections, list rows)
 *   strong    — primary in-page surfaces (booking form, hero cards)
 *   floating  — modals/popovers that need to feel like a separate layer
 *               (more opaque background, deeper drop shadow, sharper edge
 *               highlight). Use this for any portaled dialog.
 */
type Variant = "default" | "strong" | "floating";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

const variantClass: Record<Variant, string> = {
  default:  "glass",
  strong:   "glass-strong",
  floating: "glass-floating",
};

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          variantClass[variant],
          "rounded-glass",
          className
        )}
        {...rest}
      />
    );
  }
);
GlassCard.displayName = "GlassCard";

export default GlassCard;
