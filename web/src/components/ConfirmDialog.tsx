/**
 * In-app confirmation dialog — replaces the native browser `confirm()`.
 *
 * Two ways to use:
 *   1. Imperative (most ergonomic):
 *        const confirm = useConfirm();
 *        const ok = await confirm({ title: "Delete this?", danger: true });
 *
 *   2. Declarative (raw component) — render <ConfirmDialog/> with controlled props.
 *
 * Rendered via portal to document.body so it escapes any stacking context.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import GlassCard from "./GlassCard";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style confirm button as destructive (orange). */
  danger?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open, title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", danger,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink-primary/45 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <GlassCard
        variant="floating"
        className="w-full max-w-sm p-6 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          {danger && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-orange-soft text-orange-deep">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-extrabold">{title}</h3>
            {body && <p className="mt-1 text-sm text-ink-secondary">{body}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-secondary hover:bg-white/60"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost px-4 py-2 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={cn(
              "btn px-4 py-2 text-sm",
              danger ? "btn-accent" : "btn-primary"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </GlassCard>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
//  Imperative API via React Context
// ---------------------------------------------------------------------------

type Resolver = (value: boolean) => void;
const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState({ opts, resolve });
    });
  }, []);

  function close(value: boolean) {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    r?.(value);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!state}
        title={state?.opts.title ?? ""}
        body={state?.opts.body}
        confirmLabel={state?.opts.confirmLabel}
        cancelLabel={state?.opts.cancelLabel}
        danger={state?.opts.danger}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Outside provider — fall back to native confirm rather than crash.
    return async (opts: ConfirmOptions) => window.confirm(opts.title);
  }
  return ctx;
}
