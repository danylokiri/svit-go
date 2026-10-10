import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare, Search, User as UserIcon, Mail, Phone, X } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { useAdminAuth } from "@/auth/AdminContext";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { showToast } from "@/components/Toast";
import {
  fetchAdminBookings,
  updateAdminBookingStatus,
  type AdminBookingRow,
  type AdminBookingStatus,
  type CurrencyCode,
} from "@/api";

type StatusFilter = "all" | "confirmed" | "completed" | "cancelled";

export default function AdminBookingsPage() {
  const { admin, loading } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AdminBookingRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  // Booking opened in the side-modal. Holds the row id so we re-fetch from
  // local state on every render (status changes flow through `rows` and the
  // modal stays in sync without a separate refetch).
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !admin) navigate("/admin/login", { replace: true });
  }, [loading, admin, navigate]);

  useEffect(() => {
    if (!admin) return;
    fetchAdminBookings()
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [admin]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (q) {
        const customer = `${r.user?.email ?? ""} ${r.user?.name ?? ""} ${r.contact.email}`.toLowerCase();
        if (!customer.includes(q) && !r.tour.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, status]);

  const selectedRow = useMemo(
    () => (rows && selectedId != null ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId],
  );

  // Apply a status change locally as soon as the server confirms. We update
  // in-place instead of re-fetching the whole list — keeps scroll position
  // and avoids a flicker.
  async function handleStatusChange(id: number, next: AdminBookingStatus) {
    try {
      await updateAdminBookingStatus(id, next);
      setRows((p) => p?.map((r) => (r.id === id ? { ...r, status: next } : r)) ?? p);
      showToast(t("admin.bookings.statusUpdated"), "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "warn");
    }
  }

  if (loading || !admin) {
    return <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">{t("admin.bookings.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pt-20 pb-16">
      <header>
        <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">{t("admin.bookings.title")}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("admin.bookings.subtitle")}</p>
      </header>

      <GlassCard className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.bookings.searchPlaceholder")}
            className="search-pill w-full rounded-pill bg-white/60 py-2 pl-8 pr-3 text-sm outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-pill bg-white/60 px-3 py-2 text-sm font-semibold outline-none transition-colors hover:bg-white/80"
        >
          <option value="all">{t("admin.bookings.status.all")}</option>
          <option value="confirmed">{t("admin.bookings.status.confirmed")}</option>
          <option value="completed">{t("admin.bookings.status.completed")}</option>
          <option value="cancelled">{t("admin.bookings.status.cancelled")}</option>
        </select>
      </GlassCard>

      {err && (
        <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">{err}</div>
      )}

      {!filtered ? (
        <div className="text-sm text-ink-secondary">{t("admin.bookings.loading")}</div>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-ink-secondary">
          {t("admin.bookings.empty")}
        </GlassCard>
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-3 py-3">{t("admin.bookings.col.id")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.created")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.start")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.tour")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.location")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.customer")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.travelers")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.total")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.specialRequest")}</th>
                <th className="px-3 py-3">{t("admin.bookings.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <Row
                  key={b.id}
                  row={b}
                  onOpen={() => setSelectedId(b.id)}
                />
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}

      {selectedRow && (
        <BookingDetailModal
          row={selectedRow}
          onClose={() => setSelectedId(null)}
          onChangeStatus={handleStatusChange}
        />
      )}
    </div>
  );
}

function Row({
  row,
  onOpen,
}: {
  row: AdminBookingRow;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const created = new Date(row.createdAt).toLocaleDateString();
  const start = row.startDate ? new Date(row.startDate).toLocaleDateString() : "—";
  return (
    <tr
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer border-t border-white/40 align-top transition-colors hover:bg-white/40 focus:bg-white/40 focus:outline-none"
    >
      <td className="px-3 py-3 font-mono text-xs">#{row.id}</td>
      <td className="px-3 py-3 text-xs text-ink-secondary">{created}</td>
      <td className="px-3 py-3 text-xs text-ink-secondary">{start}</td>
      <td className="px-3 py-3">
        {/* Stop propagation so clicking the tour link doesn't ALSO open the
            detail modal — they're orthogonal actions. */}
        <Link
          to={`/admin/tours/${row.tour.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold hover:text-blue-deep"
        >
          {row.tour.title}
        </Link>
      </td>
      <td className="px-3 py-3 text-xs text-ink-secondary">{row.tour.country} · {row.tour.city}</td>
      <td className="px-3 py-3 text-xs">
        <div className="font-semibold text-ink-primary">{row.user?.name ?? "—"}</div>
        <div className="text-ink-secondary">{row.user?.email ?? row.contact.email}</div>
      </td>
      <td className="px-3 py-3 text-center">{row.travelers.length}</td>
      <td className="px-3 py-3">
        <div className="font-semibold"><Money eur={row.totalPrice} /></div>
        {row.totalInCurrency != null && row.currency !== "EUR" && (
          <div className="text-[10px] text-ink-muted">
            <Money
              eur={row.totalPrice}
              forceCurrency={row.currency as CurrencyCode}
              forceAmount={row.totalInCurrency}
            />
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        {row.specialRequest ? (
          <span
            title={row.specialRequest}
            className="inline-flex items-center gap-1 rounded-pill bg-orange-soft px-2 py-1 text-xs font-semibold text-orange-deep"
          >
            <MessageSquare size={12} />
            {t("admin.bookings.note")}
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <StatusChip status={row.status} />
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "confirmed" ? "chip-blue" :
    status === "completed" ? "chip-cream" :
    status === "cancelled" ? "chip-orange" :
    "chip-cream";
  return <span className={cn("chip text-xs", cls)}>{status}</span>;
}

/**
 * Booking detail side-panel — opened from a row click. Shows the customer
 * contact info, every traveller's data, special request, totals, and lets
 * the admin change the booking's status (confirmed → completed / cancelled).
 *
 * Rendered through a portal so the backdrop covers the page regardless of
 * where the originating row sits in the scroll position.
 */
function BookingDetailModal({
  row,
  onClose,
  onChangeStatus,
}: {
  row: AdminBookingRow;
  onClose: () => void;
  onChangeStatus: (id: number, status: AdminBookingStatus) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [pendingStatus, setPendingStatus] = useState<AdminBookingStatus>(row.status as AdminBookingStatus);
  const [saving, setSaving] = useState(false);
  // If the row prop updates because of a parent state refresh, re-sync the
  // selector so the modal reflects the latest server-confirmed status.
  useEffect(() => {
    setPendingStatus(row.status as AdminBookingStatus);
  }, [row.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function save() {
    if (pendingStatus === row.status) return;
    setSaving(true);
    try {
      await onChangeStatus(row.id, pendingStatus);
    } finally {
      setSaving(false);
    }
  }

  const dirty = pendingStatus !== row.status;
  const start = row.startDate ? formatDate(new Date(row.startDate), locale) : "—";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink-primary/45 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <GlassCard
        variant="floating"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("admin.bookings.detail.bookingNumber", { id: String(row.id) })}
            </div>
            <h3 className="mt-1 text-2xl font-extrabold">{row.tour.title}</h3>
            <p className="text-sm text-ink-secondary">
              {row.tour.country} · {row.tour.city} · {t("admin.bookings.detail.departing", { date: start })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-secondary transition-colors hover:bg-white/60"
          >
            <X size={16} />
          </button>
        </div>

        {/* Customer block */}
        <section className="mt-6">
          <SectionLabel>{t("admin.bookings.detail.customer")}</SectionLabel>
          <div className="mt-2 grid gap-2 rounded-glass bg-white/40 p-4 text-sm sm:grid-cols-2">
            <InfoRow icon={<UserIcon size={14} />} label={t("admin.bookings.detail.name")} value={row.user?.name ?? "—"} />
            <InfoRow icon={<Mail size={14} />}     label={t("admin.bookings.detail.email")} value={row.user?.email ?? row.contact.email} />
            <InfoRow icon={<Mail size={14} />}     label={t("admin.bookings.detail.contactEmail")} value={row.contact.email} />
            <InfoRow icon={<Phone size={14} />}    label={t("admin.bookings.detail.phone")} value={row.contact.phone} />
          </div>
        </section>

        {/* Travelers */}
        <section className="mt-5">
          <SectionLabel>
            {t("admin.bookings.detail.travelers", { n: String(row.travelers.length) })}
          </SectionLabel>
          <div className="mt-2 space-y-2">
            {row.travelers.map((tr, i) => (
              <div key={i} className="rounded-glass bg-white/40 p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-bold text-ink-primary">
                    {tr.firstName} {tr.lastName}
                  </span>
                  {tr.type && (
                    <span className={cn("chip text-[10px]", travelerChipClass(tr.type))}>
                      {t(`booking.passenger.type.${tr.type}` as const)}
                    </span>
                  )}
                </div>
                <div className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-ink-secondary sm:grid-cols-2">
                  {tr.dob && (
                    <span>{t("admin.bookings.detail.dob")}: {tr.dob}</span>
                  )}
                  {tr.passport && (
                    <span>{t("admin.bookings.detail.passport")}: {tr.passport}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Add-ons */}
        {row.addOns.length > 0 && (
          <section className="mt-5">
            <SectionLabel>{t("admin.bookings.detail.addOns")}</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.addOns.map((a) => (
                <span key={a} className="chip chip-blue text-xs">{a}</span>
              ))}
            </div>
          </section>
        )}

        {/* Special request */}
        {row.specialRequest && (
          <section className="mt-5">
            <SectionLabel>{t("admin.bookings.specialRequestLabel")}</SectionLabel>
            <p className="mt-2 whitespace-pre-line rounded-glass bg-orange-soft/40 px-4 py-3 text-sm text-ink-primary">
              {row.specialRequest}
            </p>
          </section>
        )}

        {/* Total */}
        <section className="mt-5 flex items-center justify-between rounded-glass bg-white/50 px-4 py-3">
          <span className="text-sm font-semibold text-ink-secondary">{t("admin.bookings.detail.total")}</span>
          <div className="text-right">
            <div className="text-lg font-extrabold"><Money eur={row.totalPrice} /></div>
            {row.totalInCurrency != null && row.currency !== "EUR" && (
              <div className="text-xs text-ink-muted">
                <Money
                  eur={row.totalPrice}
                  forceCurrency={row.currency as CurrencyCode}
                  forceAmount={row.totalInCurrency}
                />
              </div>
            )}
          </div>
        </section>

        {/* Status changer */}
        <section className="mt-6 rounded-glass border border-white/40 p-4">
          <SectionLabel>{t("admin.bookings.detail.changeStatus")}</SectionLabel>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(["confirmed", "completed", "cancelled"] as const).map((s) => {
              const active = pendingStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPendingStatus(s)}
                  className={cn(
                    "rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? statusActiveClass(s)
                      : "bg-white/60 text-ink-secondary hover:bg-white/80",
                  )}
                >
                  {t(`admin.bookings.status.${s}` as const)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost px-4 py-2 text-sm">
              {t("admin.dashboard.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="btn btn-primary px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving ? t("admin.admins.creating") : t("admin.bookings.detail.save")}
            </button>
          </div>
        </section>
      </GlassCard>
    </div>,
    document.body,
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{children}</div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-ink-muted">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</div>
        <div className="truncate font-semibold text-ink-primary">{value}</div>
      </div>
    </div>
  );
}

function travelerChipClass(type: string): string {
  if (type === "child") return "chip-orange";
  if (type === "senior") return "chip-cream";
  return "chip-blue";
}

function statusActiveClass(s: AdminBookingStatus): string {
  if (s === "confirmed") return "bg-blue-primary text-white shadow-soft";
  if (s === "completed") return "bg-blue-soft text-blue-deep";
  return "bg-orange-soft text-orange-deep";
}
