import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Calendar, CheckCircle2, ClipboardList, ShieldCheck, Users, XCircle } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { useAdminAuth } from "@/auth/AdminContext";
import { useI18n } from "@/lib/i18n";
import {
  approveAdminTour,
  fetchAdminBookings,
  fetchAdminOrganizers,
  fetchAdminTours,
  rejectAdminTour,
  type AdminBookingRow,
  type AdminOrganizerRow,
  type AdminTourSummary,
} from "@/api";

export default function AdminDashboardPage() {
  const { admin, loading } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [pending, setPending] = useState<AdminTourSummary[] | null>(null);
  const [allTours, setAllTours] = useState<AdminTourSummary[] | null>(null);
  const [bookings, setBookings] = useState<AdminBookingRow[] | null>(null);
  const [organizers, setOrganizers] = useState<AdminOrganizerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !admin) {
      navigate("/admin/login", { replace: true });
    }
  }, [loading, admin, navigate]);

  async function loadAll() {
    try {
      const [p, a, b, o] = await Promise.all([
        fetchAdminTours("pending"),
        fetchAdminTours(),
        fetchAdminBookings(),
        fetchAdminOrganizers(),
      ]);
      setPending(p);
      setAllTours(a);
      setBookings(b);
      setOrganizers(o);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    if (admin) loadAll();
  }, [admin]);

  const stats = useMemo(() => {
    const active = (allTours ?? []).filter((x) => x.status === "active").length;
    const last24 = (bookings ?? []).filter((b) => {
      const created = new Date(b.createdAt).getTime();
      return Date.now() - created < 24 * 60 * 60 * 1000;
    }).length;
    return {
      pending: pending?.length ?? 0,
      active,
      bookings24: last24,
      organizers: organizers?.length ?? 0,
    };
  }, [pending, allTours, bookings, organizers]);

  if (loading || !admin) {
    return (
      <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">
        {t("admin.dashboard.loading")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 pt-20 pb-16">
      <header>
        <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">
          {t("admin.dashboard.greeting", { name: admin.name })}
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("admin.dashboard.subtitle")}</p>
      </header>

      {err && (
        <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
          {err}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<ClipboardList size={18} />} label={t("admin.dashboard.statPending")} value={stats.pending} tone="orange" />
        <StatCard icon={<CheckCircle2 size={18} />} label={t("admin.dashboard.statActive")} value={stats.active} tone="blue" />
        <StatCard icon={<Calendar size={18} />} label={t("admin.dashboard.statBookings24")} value={stats.bookings24} tone="cream" />
        <StatCard icon={<Users size={18} />} label={t("admin.dashboard.statOrganizers")} value={stats.organizers} tone="cream" />
      </div>

      <ModerationQueue
        pending={pending}
        onChanged={loadAll}
      />

      <section>
        <h2 className="text-2xl font-extrabold">{t("admin.dashboard.quickNav")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickCard
            to="/admin/bookings"
            icon={<Calendar size={20} />}
            title={t("admin.dashboard.navBookings")}
            sub={t("admin.dashboard.navBookingsSub")}
          />
          <QuickCard
            to="/admin/organizers"
            icon={<Briefcase size={20} />}
            title={t("admin.dashboard.navOrganizers")}
            sub={t("admin.dashboard.navOrganizersSub")}
          />
          {admin.role === "super" && (
            <QuickCard
              to="/admin/admins"
              icon={<ShieldCheck size={20} />}
              title={t("admin.dashboard.navAdmins")}
              sub={t("admin.dashboard.navAdminsSub")}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: number;
  tone: "blue" | "orange" | "cream";
}) {
  const toneCls =
    tone === "blue" ? "bg-blue-primary/15 text-blue-deep" :
    tone === "orange" ? "bg-orange-soft text-orange-deep" :
    "bg-white/70 text-ink-primary";
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-full ${toneCls}`}>{icon}</span>
        <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      </div>
      <div className="mt-3 text-3xl font-extrabold text-ink-primary">{value}</div>
    </GlassCard>
  );
}

function QuickCard({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="block">
      <GlassCard className="h-full p-5 transition-colors hover:bg-white/60">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-primary/15 text-blue-deep">
            {icon}
          </span>
          <div>
            <div className="text-base font-extrabold">{title}</div>
            <div className="text-xs text-ink-secondary">{sub}</div>
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}

function ModerationQueue({
  pending,
  onChanged,
}: {
  pending: AdminTourSummary[] | null;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [rejecting, setRejecting] = useState<AdminTourSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(slug: string) {
    setBusy(slug);
    setError(null);
    try {
      await approveAdminTour(slug);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function reject(slug: string, reason: string) {
    setBusy(slug);
    setError(null);
    try {
      await rejectAdminTour(slug, reason);
      await onChanged();
      setRejecting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-extrabold">{t("admin.dashboard.queueTitle")}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t("admin.dashboard.queueSub")}</p>

      {error && (
        <div className="mt-3 rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">
          {error}
        </div>
      )}

      {!pending ? (
        <div className="mt-4 text-sm text-ink-secondary">{t("admin.dashboard.loading")}</div>
      ) : pending.length === 0 ? (
        <GlassCard className="mt-4 p-6 text-center text-sm text-ink-secondary">
          {t("admin.dashboard.queueEmpty")}
        </GlassCard>
      ) : (
        <div className="mt-4 space-y-3">
          {pending.map((tour) => (
            <GlassCard key={tour.slug} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Link
                  to={`/admin/tours/${tour.slug}`}
                  className="text-lg font-extrabold hover:text-blue-deep"
                >
                  {tour.title}
                </Link>
                <div className="mt-0.5 text-xs text-ink-secondary">
                  {tour.country} · {tour.city} · {tour.durationNights}n · <Money eur={tour.price} />
                </div>
                {tour.organizer && (
                  <div className="mt-1 text-xs text-ink-muted">
                    {t("admin.dashboard.byOrganizer")}: {tour.organizer.name} ({tour.organizer.email})
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/admin/tours/${tour.slug}`} className="chip chip-cream">
                  {t("admin.dashboard.review")}
                </Link>
                <button
                  type="button"
                  onClick={() => approve(tour.slug)}
                  disabled={busy === tour.slug}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-blue-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-deep disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {t("admin.dashboard.approve")}
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(tour)}
                  disabled={busy === tour.slug}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-orange-soft px-3 py-1.5 text-xs font-semibold text-orange-deep transition-colors hover:bg-orange-soft/80 disabled:opacity-60"
                >
                  <XCircle size={14} />
                  {t("admin.dashboard.reject")}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {rejecting && (
        <RejectModal
          tour={rejecting}
          busy={busy === rejecting.slug}
          onCancel={() => setRejecting(null)}
          onConfirm={(reason) => reject(rejecting.slug, reason)}
        />
      )}
    </section>
  );
}

export function RejectModal({
  tour,
  busy,
  onCancel,
  onConfirm,
}: {
  tour: AdminTourSummary | { slug: string; title: string };
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink-primary/45 p-4 backdrop-blur-sm animate-fade-up"
      onClick={onCancel}
    >
      <GlassCard
        variant="strong"
        className="w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-extrabold">{t("admin.dashboard.rejectTitle")}</h3>
        <p className="mt-1 text-sm text-ink-secondary">
          {t("admin.dashboard.rejectBody", { title: tour.title })}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder={t("admin.dashboard.rejectPlaceholder")}
          className="mt-4 w-full rounded-glass bg-white/60 px-4 py-3 text-sm outline-none focus:bg-white/80"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn btn-ghost px-4 py-2 text-sm"
          >
            {t("admin.dashboard.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || reason.trim().length === 0}
            className="btn btn-accent px-4 py-2 text-sm disabled:opacity-60"
          >
            {busy ? t("admin.dashboard.rejecting") : t("admin.dashboard.confirmReject")}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
