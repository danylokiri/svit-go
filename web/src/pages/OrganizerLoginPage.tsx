import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import GlassCard from "@/components/GlassCard";
import { useOrganizerAuth } from "@/auth/OrganizerContext";
import { useI18n } from "@/lib/i18n";

/**
 * Operator-only sign-in screen. Mirrors AuthPage visually but writes to a
 * separate OrganizerAuthContext so the traveller session is untouched —
 * the same person can be both a traveller and an operator without one
 * logging the other out.
 */
export default function OrganizerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { login, organizer, loading } = useOrganizerAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  // If a session already exists, jump straight to the cabinet. Waiting for
  // `loading` to settle prevents a flicker while the context hydrates from
  // localStorage on first paint.
  useEffect(() => {
    if (!loading && organizer) {
      navigate("/organizer", { replace: true });
    }
  }, [loading, organizer, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/organizer", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("organizer.login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-200px)] max-w-md place-items-center px-4 py-16">
      <GlassCard variant="strong" className="w-full p-8">
        <h1 className="font-marker text-center text-5xl leading-tight">
          {t("organizer.login.title")}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-secondary">
          {t("organizer.login.subtitle")}
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("organizer.login.email")}
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@example.com"
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-base outline-none placeholder:text-ink-muted focus:bg-white/80"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("organizer.login.password")}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••"
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-base outline-none placeholder:text-ink-muted focus:bg-white/80"
            />
          </label>

          {error && (
            <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary w-full disabled:opacity-60"
          >
            {busy ? t("organizer.login.busy") : t("organizer.login.cta")}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-secondary">
          {t("organizer.login.notOrganizer")}{" "}
          <Link to="/auth" className="text-blue-deep hover:underline">
            {t("organizer.login.toUserLogin")}
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
