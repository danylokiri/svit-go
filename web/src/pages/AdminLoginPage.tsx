import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import GlassCard from "@/components/GlassCard";
import { useAdminAuth } from "@/auth/AdminContext";
import { useI18n } from "@/lib/i18n";

/**
 * Admin sign-in screen. Separate token / context from user + organizer.
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { login, admin, loading } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && admin) {
      navigate("/admin", { replace: true });
    }
  }, [loading, admin, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-200px)] max-w-md place-items-center px-4 py-16">
      <GlassCard variant="strong" className="w-full p-8">
        <h1 className="font-marker text-center text-5xl leading-tight">
          {t("admin.login.title")}
        </h1>
        <p className="mt-1 text-center text-sm text-ink-secondary">
          {t("admin.login.subtitle")}
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("admin.login.email")}
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@svitgo.com"
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-3 text-base outline-none placeholder:text-ink-muted focus:bg-white/80"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("admin.login.password")}
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
            {busy ? t("admin.login.busy") : t("admin.login.cta")}
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
