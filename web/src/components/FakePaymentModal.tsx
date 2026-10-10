import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CreditCard, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Money } from "./Money";

interface Props {
  open: boolean;
  tier: "plus" | "pro";
  priceEUR: number;
  onClose: () => void;
  /** Called only after the simulated payment succeeds. */
  onSuccess: () => Promise<void> | void;
}

/**
 * Fake Stripe-style payment dialog. We're a diploma demo — no real money
 * moves — but the user explicitly asked for a payment flow because instant
 * tier-flip looked unconvincing. This pretends to charge: shows a card form,
 * pretends to network for ~1.4s, then resolves "success" and the parent
 * actually toggles the subscription via the existing /api/subscriptions/start.
 *
 * Real-world: replace this whole component with a `loadStripe(...)` redirect
 * to Stripe Checkout and let the webhook drive the DB write.
 */
export default function FakePaymentModal({ open, tier, priceEUR, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"form" | "processing" | "done">("form");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState("12/29");
  const [cvc, setCvc] = useState("123");

  // Reset to form whenever the modal opens fresh — without this, a user who
  // already saw the "success" state once would re-open into that final frame.
  useEffect(() => {
    if (open) setPhase("form");
  }, [open]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("processing");
    // Simulate network latency so the "processing" state actually reads as
    // processing. 1.4s feels long enough to be credible, short enough not
    // to test patience.
    await new Promise((r) => setTimeout(r, 1400));
    try {
      await onSuccess();
      setPhase("done");
      // Auto-close after 1.5s so the user sees the success state but isn't
      // stuck dismissing a modal manually.
      setTimeout(() => onClose(), 1500);
    } catch {
      setPhase("form");
      // Real failure would go here. We don't synthesise errors in demo.
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-ink-primary/55 p-4 backdrop-blur-sm animate-fade-in"
      onClick={phase === "form" ? onClose : undefined}
    >
      <div
        className="glass-floating animate-modal-in relative w-full max-w-md rounded-glass p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "form" && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink-secondary hover:bg-white/50 hover:text-ink-primary"
          >
            <X size={16} />
          </button>
        )}

        {phase === "form" && (
          <>
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-orange-accent text-white">
                <CreditCard size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("payment.title")}
                </div>
                <div className="text-lg font-bold">
                  SvitGo {tier === "pro" ? "Pro" : "Plus"} — <Money eur={priceEUR} /> / {t("payment.month")}
                </div>
              </div>
            </div>

            <form className="mt-6 space-y-3" onSubmit={submit}>
              <Field
                label={t("payment.cardNumber")}
                value={card}
                onChange={setCard}
                placeholder="4242 4242 4242 4242"
              />
              <Field
                label={t("payment.cardHolder")}
                value={holder}
                onChange={setHolder}
                placeholder="Danylo Kiriienko"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t("payment.expiry")}
                  value={expiry}
                  onChange={setExpiry}
                  placeholder="MM/YY"
                />
                <Field
                  label={t("payment.cvc")}
                  value={cvc}
                  onChange={setCvc}
                  placeholder="•••"
                />
              </div>

              <p className="text-[11px] leading-snug text-ink-muted">
                {t("payment.demoNotice")}
              </p>

              <button
                type="submit"
                className="btn btn-primary w-full justify-center"
              >
                {t("payment.cta")} — <Money eur={priceEUR} />
              </button>
            </form>
          </>
        )}

        {phase === "processing" && (
          <div className="grid place-items-center gap-3 py-8">
            <Loader2 size={36} className="animate-spin text-blue-primary" />
            <div className="text-center text-sm text-ink-secondary">
              {t("payment.processing")}
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="grid place-items-center gap-3 py-8">
            <CheckCircle2 size={48} className="text-blue-primary" />
            <div className="text-center text-lg font-bold">
              {t("payment.success")}
            </div>
            <div className="text-center text-xs text-ink-secondary">
              {t("payment.successSub", { tier: tier === "pro" ? "Pro" : "Plus" })}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-glass bg-white/60 px-3 py-2 text-sm tabular-nums outline-none focus:bg-white/80"
      />
    </label>
  );
}
