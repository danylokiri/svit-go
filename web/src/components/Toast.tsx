import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Tone = "info" | "success" | "warn";

interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
  /** True while the exit animation is playing — after EXIT_MS we drop the row. */
  leaving?: boolean;
}

// Must match the duration of the .animate-toast-out keyframe in index.css.
// Mismatch would cause either a hard pop (too short) or a lingering ghost
// row (too long).
const EXIT_MS = 180;
// How long the toast stays fully shown before exit starts.
const SHOW_MS = 3500;

/**
 * Lightweight global toast system. No context — components fire toasts
 * via the `showToast(...)` helper which dispatches a window CustomEvent.
 * One `<ToastHost>` mounted near the app root listens and renders.
 *
 * Why a window event rather than React context: keeps callers (TourCard,
 * compare helpers, etc.) free from importing a provider/hook, and works
 * fine even from non-React code (lib/* helpers). Trade-off is we lose
 * type safety on the payload, hence the runtime shape check.
 */
const EVENT = "svitgo:toast";

export function showToast(text: string, tone: Tone = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone } }));
}

let nextId = 1;

export function ToastHost() {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);

  /** Mark a toast as leaving — runs the exit keyframe — then drop the row. */
  function dismiss(id: number) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, leaving: true } : it)));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }, EXIT_MS);
  }

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent).detail as { text?: unknown; tone?: unknown } | undefined;
      if (!detail || typeof detail.text !== "string") return;
      const tone: Tone = detail.tone === "success" || detail.tone === "warn" ? detail.tone : "info";
      const id = nextId++;
      setItems((prev) => [...prev, { id, text: detail.text as string, tone }]);
      // Auto-dismiss: visible for SHOW_MS, then run the exit animation.
      // Two timers (start-exit and actually-remove) so the leaving class
      // has time to animate before the row unmounts.
      window.setTimeout(() => dismiss(id), SHOW_MS);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((it) => (
        <div
          key={it.id}
          className={cn(
            "glass-strong pointer-events-auto flex max-w-md items-start gap-2.5 rounded-glass px-4 py-3 text-sm shadow-glass-lg",
            it.leaving ? "animate-toast-out" : "animate-toast-in",
          )}
          role="status"
        >
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full",
              it.tone === "success" && "bg-blue-primary/15 text-blue-deep",
              it.tone === "warn" && "bg-orange-soft/70 text-orange-deep",
              it.tone === "info" && "bg-white/70 text-ink-secondary",
            )}
          >
            {it.tone === "success" ? <CheckCircle2 size={15} /> :
             it.tone === "warn"    ? <AlertTriangle size={15} /> :
                                     <Info size={15} />}
          </span>
          <span className="flex-1 leading-snug text-ink-primary">{it.text}</span>
          <button
            type="button"
            onClick={() => dismiss(it.id)}
            aria-label={t("common.close")}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/60 hover:text-ink-primary"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
