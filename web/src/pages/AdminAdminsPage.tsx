import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, X } from "lucide-react";
import GlassCard from "@/components/GlassCard";
import { useAdminAuth } from "@/auth/AdminContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  createAdminAdmin,
  deleteAdminAdmin,
  fetchAdminAdminsList,
  type AdminMe,
  type AdminRole,
} from "@/api";

export default function AdminAdminsPage() {
  const { admin, loading } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [rows, setRows] = useState<AdminMe[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!loading && !admin) {
      navigate("/admin/login", { replace: true });
    } else if (!loading && admin && admin.role !== "super") {
      navigate("/admin", { replace: true });
    }
  }, [loading, admin, navigate]);

  async function load() {
    try {
      const list = await fetchAdminAdminsList();
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  useEffect(() => {
    if (admin && admin.role === "super") load();
  }, [admin]);

  async function remove(row: AdminMe) {
    if (row.id === admin?.id) return;
    const ok = await confirm({
      title: t("admin.admins.deleteConfirmTitle"),
      body: t("admin.admins.deleteConfirmBody", { name: row.name, email: row.email }),
      confirmLabel: t("admin.admins.confirmDelete"),
      cancelLabel: t("admin.dashboard.cancel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAdminAdmin(row.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading || !admin || admin.role !== "super") {
    return <div className="mx-auto max-w-5xl px-4 pt-16 text-sm text-ink-secondary">{t("admin.admins.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-20 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-marker text-5xl leading-[1.1] md:text-6xl">{t("admin.admins.title")}</h1>
          <p className="mt-2 text-sm text-ink-secondary">{t("admin.admins.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Plus size={14} />
          {t("admin.admins.add")}
        </button>
      </header>

      {err && (
        <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">{err}</div>
      )}

      {!rows ? (
        <div className="text-sm text-ink-secondary">{t("admin.admins.loading")}</div>
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-3">{t("admin.admins.col.name")}</th>
                <th className="px-4 py-3">{t("admin.admins.col.email")}</th>
                <th className="px-4 py-3">{t("admin.admins.col.role")}</th>
                <th className="px-4 py-3">{t("admin.admins.col.createdAt")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/40">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-ink-secondary">{r.email}</td>
                  <td className="px-4 py-3">
                    <span className={cn("chip text-xs", r.role === "super" ? "chip-orange" : "chip-blue")}>
                      {r.role === "super" ? t("adminHeader.role.super") : t("adminHeader.role.admin")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-secondary">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.id !== admin.id && (
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-white/60 px-3 py-1.5 text-xs font-semibold text-orange-deep transition-colors hover:bg-orange-soft/60"
                      >
                        <Trash2 size={12} />
                        {t("admin.admins.delete")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}

      {adding && (
        <AddAdminModal
          onClose={() => setAdding(false)}
          onCreated={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function AddAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createAdminAdmin({ name: name.trim(), email: email.trim(), password, role });
      await onCreated();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  // Lock body scroll + Esc-to-close while the dialog is open. Portal to body
  // so the backdrop covers the whole viewport regardless of parent stacking
  // contexts (the page wrapper has `pt-20` etc which made the inline modal
  // look offset / "wonky" — escaping fixes that).
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink-primary/45 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <GlassCard
        variant="floating"
        className="w-full max-w-md p-6 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold">{t("admin.admins.addTitle")}</h3>
            <p className="mt-1 text-sm text-ink-secondary">{t("admin.admins.addBody")}</p>
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
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Labeled label={t("admin.admins.field.name")}>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-2.5 text-sm outline-none focus:bg-white/80"
            />
          </Labeled>
          <Labeled label={t("admin.admins.field.email")}>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-2.5 text-sm outline-none focus:bg-white/80"
            />
          </Labeled>
          <Labeled label={t("admin.admins.field.password")}>
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-2.5 text-sm outline-none focus:bg-white/80"
            />
          </Labeled>
          <Labeled label={t("admin.admins.field.role")}>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="mt-2 w-full rounded-glass bg-white/60 px-4 py-2.5 text-sm outline-none focus:bg-white/80"
            >
              <option value="admin">{t("adminHeader.role.admin")}</option>
              <option value="super">{t("adminHeader.role.super")}</option>
            </select>
          </Labeled>

          {err && (
            <div className="rounded-glass bg-orange-soft/60 px-4 py-3 text-sm text-orange-deep">{err}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost px-4 py-2 text-sm">
              {t("admin.dashboard.cancel")}
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary px-4 py-2 text-sm disabled:opacity-60">
              {busy ? t("admin.admins.creating") : t("admin.admins.create")}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>,
    document.body,
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
