import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Briefcase } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/lib/i18n";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { login, register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/account";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate(redirectTo, { replace: true });
      } else {
        await register(email, password, name);
        // Brand-new accounts go straight to the AI-preferences tab in their
        // cabinet — pilot user testing showed the AI chat is dramatically
        // more useful once travel preferences (budget, themes, frequency)
        // are filled in. Defaulting fresh users to that tab is a cheap
        // onboarding nudge; they can still close it and use the catalog.
        navigate("/account?tab=ai", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-200px)] max-w-md place-items-center px-4 py-16">
      <GlassCard variant="strong" className="w-full p-8">
        <h1 className="font-marker text-center text-5xl leading-tight">
          {mode === "login" ? t("auth.welcomeBack") : t("auth.createAccount")}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-secondary">
          {mode === "login" ? t("auth.signInSub") : t("auth.signUpSub")}
        </p>

        <div className="mt-6 flex rounded-pill bg-white/40 p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              className={cn(
                "flex-1 rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
                mode === m ? "bg-white text-ink-primary shadow-soft" : "text-ink-secondary"
              )}
            >
              {m === "login" ? t("auth.signIn") : t("auth.signUp")}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {mode === "register" && (
            <Field label={t("auth.fieldName")} value={name} onChange={setName} placeholder="Danylo" />
          )}
          <Field label={t("auth.fieldEmail")} type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <div>
            <Field label={t("auth.fieldPassword")} type="password" value={password} onChange={setPassword} placeholder="•••••••" />
            {mode === "register" && (
              <p className="mt-1.5 text-xs text-ink-muted">{t("auth.passwordHint")}</p>
            )}
          </div>

          {error && (
            <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
            {busy ? "..." : mode === "login" ? t("auth.signIn") : t("auth.createAccount")}
          </button>
        </form>

        {/* Terms/Privacy text — links removed until the docs actually exist.
            Dead anchors visible on a public deploy look like a half-built site. */}
        <p className="mt-6 text-center text-xs text-ink-muted">
          {t("auth.terms")}{" "}
          <span className="text-ink-secondary">{t("auth.termsLink")}</span>{" "}&{" "}
          <span className="text-ink-secondary">{t("auth.privacyLink")}</span>.
        </p>

        {/* Operator entrance — agencies + private guides log in to a separate
            cabinet through their own page so the two flows can't be confused. */}
        <div className="mt-6 flex items-center gap-3 rounded-glass bg-white/40 p-3 text-xs">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-primary/15 text-blue-deep">
            <Briefcase size={15} />
          </span>
          <div className="flex-1 leading-snug text-ink-secondary">
            {t("auth.organizerHint")}
          </div>
          <Link
            to="/organizer/login"
            className="rounded-pill bg-white/80 px-3 py-1.5 font-semibold text-blue-deep hover:bg-white"
          >
            {t("auth.organizerCta")}
          </Link>
        </div>
      </GlassCard>
    </div>
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
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-base outline-none placeholder:text-ink-muted focus:bg-white/80"
      />
    </label>
  );
}
