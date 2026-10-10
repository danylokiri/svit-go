import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ExternalLink, Trash2, XCircle } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import TourImage from "@/components/TourImage";
import { Money } from "@/components/Money";
import { useAdminAuth } from "@/auth/AdminContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { useI18n, softT } from "@/lib/i18n";
import {
  approveAdminTour,
  deleteAdminTour,
  fetchAdminTour,
  rejectAdminTour,
  type AdminTourDetails,
  type TourModerationStatus,
} from "@/api";
import { cn } from "@/lib/utils";
import { RejectModal } from "./AdminDashboardPage";

export default function AdminTourReviewPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { admin, loading } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [tour, setTour] = useState<AdminTourDetails | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!loading && !admin) {
      navigate("/admin/login", { replace: true });
    }
  }, [loading, admin, navigate]);

  async function load() {
    try {
      const t = await fetchAdminTour(slug);
      setTour(t);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  useEffect(() => {
    if (admin && slug) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, slug]);

  async function approve() {
    setBusy(true);
    try {
      await approveAdminTour(slug);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function reject(reason: string) {
    setBusy(true);
    try {
      await rejectAdminTour(slug, reason);
      await load();
      setRejecting(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t("admin.tour.deleteConfirmTitle"),
      body: t("admin.tour.deleteConfirmBody"),
      confirmLabel: t("admin.tour.confirmDelete"),
      cancelLabel: t("admin.dashboard.cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteAdminTour(slug);
      navigate("/admin", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  }

  if (loading || !admin) {
    return <div className="mx-auto max-w-5xl px-4 pt-16 text-sm text-ink-secondary">{t("admin.tour.loading")}</div>;
  }
  if (err && !tour) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-16">
        <Link to="/admin" className="text-sm text-blue-deep hover:underline">{t("admin.tour.back")}</Link>
        <GlassCard className="p-8 text-center text-ink-secondary">{err}</GlassCard>
      </div>
    );
  }
  if (!tour) {
    return <div className="mx-auto max-w-5xl px-4 pt-16 text-sm text-ink-secondary">{t("admin.tour.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-20 pb-16">
      <Link to="/admin" className="text-sm text-blue-deep hover:underline">{t("admin.tour.back")}</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-marker text-4xl leading-[1.1] md:text-5xl">{tour.title}</h1>
          <p className="mt-1 text-sm text-ink-secondary">{tour.country} · {tour.city}</p>
          <div className="mt-2">
            <StatusBadge status={tour.status} />
          </div>
        </div>
        <Link to={`/tour/${tour.slug}`} className="chip chip-cream">
          <ExternalLink size={12} className="mr-1 inline" />
          {t("admin.tour.viewPublic")}
        </Link>
      </div>

      {tour.status === "rejected" && tour.rejectionReason && (
        <GlassCard variant="strong" className="border border-orange-soft p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-orange-deep">
            {t("admin.tour.rejectionReasonLabel")}
          </div>
          <p className="mt-1 text-sm text-ink-primary">{tour.rejectionReason}</p>
        </GlassCard>
      )}

      <div className="flex flex-wrap gap-2">
        {tour.status !== "active" && (
          <button
            type="button"
            onClick={approve}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-pill bg-blue-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-deep disabled:opacity-60"
          >
            <CheckCircle2 size={14} />
            {t("admin.tour.approve")}
          </button>
        )}
        {tour.status !== "rejected" && (
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-pill bg-orange-soft px-4 py-2 text-sm font-semibold text-orange-deep transition-colors hover:bg-orange-soft/80 disabled:opacity-60"
          >
            <XCircle size={14} />
            {t("admin.tour.reject")}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-pill bg-white/60 px-4 py-2 text-sm font-semibold text-orange-deep transition-colors hover:bg-white/80 disabled:opacity-60"
        >
          <Trash2 size={14} />
          {t("admin.tour.delete")}
        </button>
      </div>

      <Section title={t("admin.tour.section.basics")}>
        <KV label={t("admin.tour.kv.title")} value={tour.title} />
        <KV label={t("admin.tour.kv.country")} value={tour.country} />
        <KV label={t("admin.tour.kv.city")} value={tour.city} />
        <KV label={t("admin.tour.kv.duration")} value={`${tour.durationNights} ${tour.durationNights === 1 ? t("tour.night") : t("tour.nights")}`} />
        <KV label={t("admin.tour.kv.hotelStars")} value={`${tour.hotelStars}★`} />
        <KV label={t("admin.tour.kv.meal")} value={tour.meal} />
        <KV
          label={t("admin.tour.kv.shortDescription")}
          value={tour.shortDescription || "—"}
          span
        />
        <KV
          label={t("admin.tour.kv.description")}
          value={tour.description || "—"}
          span
          preserveLines
        />
      </Section>

      <Section title={t("admin.tour.section.pricing")}>
        <KV label={t("admin.tour.kv.price")} valueNode={<Money eur={tour.price} />} />
        {tour.oldPrice != null && (
          <KV label={t("admin.tour.kv.oldPrice")} valueNode={<Money eur={tour.oldPrice} />} />
        )}
      </Section>

      <Section title={t("admin.tour.section.themes")}>
        <div className="flex flex-wrap gap-2">
          {tour.themes.length === 0 ? (
            <span className="text-sm text-ink-muted">—</span>
          ) : tour.themes.map((th) => (
            <span key={th} className="chip chip-blue">{softT(t, "theme", th)}</span>
          ))}
        </div>
      </Section>

      <Section title={t("admin.tour.section.program")}>
        {tour.program.length === 0 ? (
          <p className="text-sm text-ink-muted">—</p>
        ) : (
          <div className="space-y-3">
            {tour.program.map((d) => (
              <div key={d.day} className="rounded-glass bg-white/50 p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-deep">
                  {t("admin.tour.day", { n: d.day })}
                </div>
                <div className="text-base font-semibold">{d.title}</div>
                {d.text && <p className="mt-1 whitespace-pre-line text-sm text-ink-secondary">{d.text}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("admin.tour.section.lists")}>
        <ListBlock label={t("admin.tour.kv.highlights")} items={tour.highlights} />
        <ListBlock label={t("admin.tour.kv.included")} items={tour.included} />
        <ListBlock label={t("admin.tour.kv.excluded")} items={tour.excluded} />
      </Section>

      <Section title={t("admin.tour.section.images")}>
        {tour.imageCount > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="overflow-hidden rounded-glass bg-cream-2">
              <TourImage
                slug={tour.slug}
                imageCount={tour.imageCount}
                alt={tour.title}
                className="h-32 w-full object-cover"
              />
            </div>
            <KV label={t("admin.tour.kv.imageCount")} value={String(tour.imageCount)} />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t("admin.tour.noImages")}</p>
        )}
      </Section>

      <Section title={t("admin.tour.section.departures")}>
        {tour.departures.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("admin.tour.noDepartures")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tour.departures.map((d) => (
              <span key={d} className="chip chip-cream">{d}</span>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("admin.tour.section.stats")}>
        <KV label={t("admin.tour.kv.bookings")} value={String(tour.bookingsCount)} />
        <KV label={t("admin.tour.kv.reviews")} value={String(tour.reviewsCount)} />
        <KV label={t("admin.tour.kv.createdAt")} value={new Date(tour.createdAt).toLocaleString()} />
        <KV label={t("admin.tour.kv.publishedAt")} value={new Date(tour.publishedAt).toLocaleString()} />
      </Section>

      {tour.organizer && (
        <Section title={t("admin.tour.section.organizer")}>
          <KV label={t("admin.tour.kv.orgName")} value={tour.organizer.name} />
          <KV label={t("admin.tour.kv.orgEmail")} value={tour.organizer.email} />
          <KV label={t("admin.tour.kv.orgPhone")} value={tour.organizer.phone || "—"} />
          {tour.organizer.whatsapp && (
            <KV label={t("admin.tour.kv.orgWhatsapp")} value={tour.organizer.whatsapp} />
          )}
          {tour.organizer.type && (
            <KV label={t("admin.tour.kv.orgType")} value={tour.organizer.type} />
          )}
          {tour.organizer.yearsActive != null && (
            <KV label={t("admin.tour.kv.orgYearsActive")} value={String(tour.organizer.yearsActive)} />
          )}
          {tour.organizer.verified != null && (
            <KV
              label={t("admin.tour.kv.orgVerified")}
              value={tour.organizer.verified ? t("admin.tour.yes") : t("admin.tour.no")}
            />
          )}
          <div className="md:col-span-2">
            <Link
              to={`/operator/${tour.organizer.slug}`}
              className="text-sm text-blue-deep hover:underline"
            >
              {t("admin.tour.viewOrganizer")} →
            </Link>
          </div>
        </Section>
      )}

      {rejecting && (
        <RejectModal
          tour={{ slug: tour.slug, title: tour.title }}
          busy={busy}
          onCancel={() => setRejecting(false)}
          onConfirm={reject}
        />
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: TourModerationStatus }) {
  const { t } = useI18n();
  const map: Record<TourModerationStatus, { cls: string; label: string }> = {
    pending: { cls: "chip-orange", label: t("organizer.status.pending") },
    active: { cls: "chip-blue", label: t("organizer.status.active") },
    disabled: { cls: "chip-cream", label: t("organizer.status.disabled") },
    rejected: { cls: "chip-orange", label: t("organizer.status.rejected") },
  };
  const { cls, label } = map[status];
  return <span className={cn("chip text-xs", cls)}>{label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard variant="strong" className="p-6">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>
    </GlassCard>
  );
}

function KV({
  label,
  value,
  valueNode,
  span,
  preserveLines,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  span?: boolean;
  preserveLines?: boolean;
}) {
  return (
    <div className={span ? "md:col-span-2" : undefined}>
      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-sm text-ink-primary",
          preserveLines ? "whitespace-pre-line" : undefined,
        )}
      >
        {valueNode ?? value}
      </div>
    </div>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="md:col-span-2">
      <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">—</p>
      ) : (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {items.map((it, i) => (
            <li key={i} className="rounded-pill bg-white/50 px-3 py-1.5 text-sm">{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
