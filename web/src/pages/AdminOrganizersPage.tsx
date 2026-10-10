import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExternalLink, BadgeCheck } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { useAdminAuth } from "@/auth/AdminContext";
import { useI18n } from "@/lib/i18n";
import { fetchAdminOrganizers, type AdminOrganizerRow } from "@/api";

export default function AdminOrganizersPage() {
  const { admin, loading } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminOrganizerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !admin) navigate("/admin/login", { replace: true });
  }, [loading, admin, navigate]);

  useEffect(() => {
    if (!admin) return;
    fetchAdminOrganizers()
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [admin]);

  if (loading || !admin) {
    return <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">{t("admin.organizers.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pt-20 pb-16">
      <header>
        <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">{t("admin.organizers.title")}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("admin.organizers.subtitle")}</p>
      </header>

      {err && (
        <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">{err}</div>
      )}

      {!rows ? (
        <div className="text-sm text-ink-secondary">{t("admin.organizers.loading")}</div>
      ) : rows.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-ink-secondary">
          {t("admin.organizers.empty")}
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o) => (
            <GlassCard key={o.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/operator/${o.slug}`}
                  className="text-lg font-extrabold hover:text-blue-deep"
                >
                  {o.name}
                </Link>
                {o.verified && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-deep">
                    <BadgeCheck size={14} />
                    {t("admin.organizers.verified")}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <span className="chip chip-cream text-[10px]">
                  {o.type === "company" ? t("admin.organizers.typeCompany") : t("admin.organizers.typePrivate")}
                </span>
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                <Row label={t("admin.organizers.email")} value={o.email} />
                <Row label={t("admin.organizers.phone")} value={o.phone || "—"} />
                {o.whatsapp && <Row label={t("admin.organizers.whatsapp")} value={o.whatsapp} />}
                <Row label={t("admin.organizers.yearsActive")} value={String(o.yearsActive)} />
                <Row label={t("admin.organizers.toursCount")} value={String(o.toursCount)} />
              </dl>
              <Link
                to={`/operator/${o.slug}`}
                className="mt-4 inline-flex items-center gap-1 text-xs text-blue-deep hover:underline"
              >
                <ExternalLink size={11} />
                {t("admin.organizers.viewPublic")}
              </Link>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-ink-primary">{value}</dd>
    </div>
  );
}
