import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare, Search } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { Money } from "@/components/Money";
import { useOrganizerAuth } from "@/auth/OrganizerContext";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  fetchOrganizerBookings,
  type OrganizerBookingRow,
} from "@/api";

export default function OrganizerBookingsPage() {
  const { organizer, loading } = useOrganizerAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [rows, setRows] = useState<OrganizerBookingRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tourFilter, setTourFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !organizer) navigate("/organizer/login", { replace: true });
  }, [loading, organizer, navigate]);

  useEffect(() => {
    if (!organizer) return;
    fetchOrganizerBookings()
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [organizer]);

  const tourOptions = useMemo(() => {
    if (!rows) return [];
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.tour.slug, r.tour.title);
    return Array.from(m.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tourFilter !== "all" && r.tour.slug !== tourFilter) return false;
      if (q) {
        const name = `${r.user?.name ?? ""} ${r.user?.email ?? ""} ${r.contact.email}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tourFilter, query]);

  if (loading || !organizer) {
    return <div className="mx-auto max-w-7xl px-4 pt-16 text-sm text-ink-secondary">{t("organizer.bookings.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pt-20 pb-16">
      <Link to="/organizer" className="text-sm text-blue-deep hover:underline">{t("organizer.edit.back")}</Link>

      <header>
        <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">{t("organizer.bookings.title")}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{t("organizer.bookings.subtitle")}</p>
      </header>

      <GlassCard className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("organizer.bookings.searchPlaceholder")}
            className="search-pill w-full rounded-pill bg-white/60 py-2 pl-8 pr-3 text-sm outline-none"
          />
        </div>
        <select
          value={tourFilter}
          onChange={(e) => setTourFilter(e.target.value)}
          className="rounded-pill bg-white/60 px-3 py-2 text-sm font-semibold outline-none transition-colors hover:bg-white/80"
        >
          <option value="all">{t("organizer.bookings.allTours")}</option>
          {tourOptions.map(([slug, title]) => (
            <option key={slug} value={slug}>{title}</option>
          ))}
        </select>
      </GlassCard>

      {err && (
        <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">{err}</div>
      )}

      {!filtered ? (
        <div className="text-sm text-ink-secondary">{t("organizer.bookings.loading")}</div>
      ) : filtered.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-ink-secondary">
          {t("organizer.bookings.empty")}
        </GlassCard>
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-3 py-3">{t("organizer.bookings.col.tour")}</th>
                <th className="px-3 py-3">{t("organizer.bookings.col.customer")}</th>
                <th className="px-3 py-3">{t("organizer.bookings.col.travelers")}</th>
                <th className="px-3 py-3">{t("organizer.bookings.col.start")}</th>
                <th className="px-3 py-3">{t("organizer.bookings.col.total")}</th>
                <th className="px-3 py-3">{t("organizer.bookings.col.specialRequest")}</th>
                <th className="px-3 py-3">{t("organizer.bookings.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <Row
                  key={b.id}
                  row={b}
                  expanded={expanded === b.id}
                  onToggle={() => setExpanded(expanded === b.id ? null : b.id)}
                />
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}

function Row({
  row,
  expanded,
  onToggle,
}: {
  row: OrganizerBookingRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const start = row.startDate ? new Date(row.startDate).toLocaleDateString() : "—";
  return (
    <>
      <tr className="border-t border-white/40 align-top">
        <td className="px-3 py-3">
          <Link to={`/organizer/tours/${row.tour.slug}`} className="font-semibold hover:text-blue-deep">
            {row.tour.title}
          </Link>
          <div className="text-[10px] text-ink-muted">{row.tour.country} · {row.tour.city}</div>
        </td>
        <td className="px-3 py-3 text-xs">
          <div className="font-semibold text-ink-primary">{row.user?.name ?? "—"}</div>
          <div className="text-ink-secondary">{row.user?.email ?? row.contact.email}</div>
          <div className="text-ink-muted">{row.contact.phone}</div>
        </td>
        <td className="px-3 py-3 text-center">{row.travelers.length}</td>
        <td className="px-3 py-3 text-xs text-ink-secondary">{start}</td>
        <td className="px-3 py-3 font-semibold"><Money eur={row.totalPrice} /></td>
        <td className="px-3 py-3">
          {row.specialRequest ? (
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center gap-1 rounded-pill bg-orange-soft px-2 py-1 text-xs font-semibold text-orange-deep transition-colors hover:bg-orange-soft/80"
            >
              <MessageSquare size={12} />
              {t("organizer.bookings.note")}
            </button>
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </td>
        <td className="px-3 py-3">
          <StatusChip status={row.status} />
        </td>
      </tr>
      {expanded && row.specialRequest && (
        <tr className="border-t border-white/40 bg-white/30">
          <td colSpan={7} className="px-3 py-3 text-sm text-ink-primary">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("organizer.bookings.specialRequestLabel")}
            </div>
            <p className="mt-1 whitespace-pre-line">{row.specialRequest}</p>
          </td>
        </tr>
      )}
    </>
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
