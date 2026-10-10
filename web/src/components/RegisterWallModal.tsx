import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

// (uses existing useI18n hook below — no separate import needed)

/**
 * Soft paywall shown to anonymous users once they hit their free AI quota.
 * Rendered via portal so it sits above the chat layout. Esc closes (handled
 * in parent for now) — clicking the backdrop also closes so the user is
 * never trapped.
 */
export default function RegisterWallModal({ open, onClose }: Props) {
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-ink-primary/55 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-floating animate-modal-in relative w-full max-w-md rounded-glass p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-secondary hover:bg-white/50 hover:text-ink-primary"
        >
          <X size={16} />
        </button>

        <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-orange-accent text-white">
          <Sparkles size={22} />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">
          {t("anonLimit.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
          {t("anonLimit.body")}
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-primary">✓</span>
            <span>{t("anonLimit.benefit1")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-primary">✓</span>
            <span>{t("anonLimit.benefit2")}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-primary">✓</span>
            <span>{t("anonLimit.benefit3")}</span>
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/auth"
            state={{ from: "/ai" }}
            onClick={onClose}
            className="btn btn-primary w-full justify-center"
          >
            {t("anonLimit.ctaRegister")}
          </Link>
          <Link
            to="/auth"
            state={{ from: "/ai", mode: "login" }}
            onClick={onClose}
            className="rounded-pill px-4 py-2 text-center text-sm font-semibold text-ink-secondary hover:bg-white/50"
          >
            {t("anonLimit.ctaLogin")}
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
