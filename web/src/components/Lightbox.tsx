import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Props {
  images: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  alt?: string;
}

/**
 * Full-screen image viewer with prev/next navigation.
 * Keyboard: Esc closes, ←/→ navigates.
 */
export default function Lightbox({ images, index, onIndexChange, onClose, alt = "" }: Props) {
  const { t } = useI18n();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", onKey);
    // Lock scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length]);

  if (!images.length) return null;
  const safeIndex = Math.max(0, Math.min(index, images.length - 1));
  const src = images[safeIndex];

  function prev() {
    onIndexChange((safeIndex - 1 + images.length) % images.length);
  }
  function next() {
    onIndexChange((safeIndex + 1) % images.length);
  }

  // Render via portal to document.body so we escape any parent stacking
  // context (e.g. <main z-10>) and reliably cover the fixed header.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-primary/85 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30"
      >
        <X size={20} />
      </button>

      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute left-4 top-4 z-10 rounded-pill bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
          {safeIndex + 1} / {images.length}
        </div>
      )}

      {/* Prev */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label={t("common.previous")}
          className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {/* Image */}
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[92vw] rounded-glass object-contain shadow-glass-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {images.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label={t("common.next")}
          className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/30"
        >
          <ChevronRight size={22} />
        </button>
      )}
    </div>,
    document.body,
  );
}
