import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Check,
  Coins,
  Globe,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/auth/AdminContext";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CurrencyCode } from "@/api";

/**
 * Header used only on `/admin/*` routes — strict admin identity only.
 * Mirrors OrganizerHeader visually with a distinct ADMIN label and palette.
 */
export default function AdminHeader() {
  const { admin, logout } = useAdminAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <header className="fixed left-0 right-0 top-0 z-30 px-4 pt-4">
      <div className="glass mx-auto flex h-20 max-w-7xl items-center justify-between rounded-pill px-4">
        <Link to={admin ? "/admin" : "/"} aria-label="SvitGo admin" className="flex items-center gap-2 pl-2">
          <img src="/logo-full.svg" alt="SvitGo" className="h-12 w-auto md:h-14" />
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-orange-deep md:inline">
            {t("adminHeader.label")}
          </span>
        </Link>

        {admin && (
          <nav className="hidden items-center gap-1 md:flex">
            <AdminLink to="/admin">{t("adminHeader.nav.queue")}</AdminLink>
            <AdminLink to="/admin/bookings">{t("adminHeader.nav.bookings")}</AdminLink>
            <AdminLink to="/admin/organizers">{t("adminHeader.nav.organizers")}</AdminLink>
            {admin.role === "super" && (
              <AdminLink to="/admin/admins">{t("adminHeader.nav.admins")}</AdminLink>
            )}
          </nav>
        )}

        <div className="flex items-center gap-1.5">
          {admin ? (
            <AdminMenu
              name={admin.name}
              email={admin.email}
              role={admin.role}
              onSignOut={() => { logout(); navigate("/", { replace: true }); }}
            />
          ) : (
            <Link to="/admin/login" className="btn btn-primary px-4 py-2 text-sm">
              <ShieldCheck size={16} />
              {t("adminHeader.signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function AdminLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/admin"}
      className={({ isActive }) =>
        cn(
          "rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors",
          isActive
            ? "bg-orange-soft text-orange-deep"
            : "text-ink-secondary hover:bg-white/60 hover:text-ink-primary",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function AdminMenu({
  name,
  email,
  role,
  onSignOut,
}: {
  name: string;
  email: string;
  role: "admin" | "super";
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState<"lang" | "currency" | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { t, locale, setLocale } = useI18n();
  const { currency, setCurrency, supported, symbols } = useCurrency();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSubOpen(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setSubOpen(null); }
    }
    if (open) {
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Admin menu"
        onClick={() => { setOpen((o) => !o); setSubOpen(null); }}
        className="flex items-center gap-2 rounded-pill bg-orange-soft/60 px-3 py-1.5 text-sm font-semibold text-orange-deep transition-colors hover:bg-orange-soft"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-orange-accent text-white">
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate sm:inline">{name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="glass-strong animate-pop-in absolute right-0 top-12 z-40 w-72 rounded-glass p-2 text-sm shadow-glass-lg"
        >
          <div className="rounded-glass px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              {t("adminHeader.signedInAs")}
            </div>
            <div className="mt-1 truncate text-base font-bold">{name}</div>
            <div className="truncate text-xs text-ink-secondary">{email}</div>
            <div className="mt-1.5">
              <span className={cn("chip text-[10px]", role === "super" ? "chip-orange" : "chip-blue")}>
                {role === "super" ? t("adminHeader.role.super") : t("adminHeader.role.admin")}
              </span>
            </div>
          </div>

          <div className="my-1 h-px bg-white/50" />

          <SubmenuRow
            icon={<Globe size={16} />}
            label={t("menu.language")}
            value={locale.toUpperCase()}
            active={subOpen === "lang"}
            onToggle={() => setSubOpen(subOpen === "lang" ? null : "lang")}
          >
            <LangChoices locale={locale} setLocale={(l) => { setLocale(l); setSubOpen(null); }} />
          </SubmenuRow>
          <SubmenuRow
            icon={<Coins size={16} />}
            label={t("menu.currency")}
            value={currency}
            active={subOpen === "currency"}
            onToggle={() => setSubOpen(subOpen === "currency" ? null : "currency")}
          >
            <CurrencyChoices
              current={currency}
              supported={supported}
              symbols={symbols}
              onPick={(c) => { setCurrency(c); setSubOpen(null); }}
            />
          </SubmenuRow>
          <MenuItem
            icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
            onClick={() => toggleTheme()}
          />

          <div className="my-1 h-px bg-white/50" />

          <MenuItem
            icon={<LogOut size={16} />}
            label={t("adminHeader.signOut")}
            onClick={() => { setOpen(false); onSignOut(); }}
            tone="danger"
          />
        </div>
      )}
    </div>
  );
}

function SubmenuRow({
  icon, label, value, active, onToggle, children,
}: {
  icon: React.ReactNode; label: string; value: string;
  active: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-glass px-3 py-2 text-left transition-colors hover:bg-white/60"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70">{icon}</span>
        <span className="flex-1 font-medium">{label}</span>
        <span className="rounded-pill bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">{value}</span>
      </button>
      {active && (
        <div className="animate-submenu mb-1 ml-7 mt-0.5 rounded-glass bg-white/40 p-1">
          {children}
        </div>
      )}
    </div>
  );
}

function LangChoices({
  locale, setLocale,
}: {
  locale: ReturnType<typeof useI18n>["locale"];
  setLocale: ReturnType<typeof useI18n>["setLocale"];
}) {
  const options: { code: typeof locale; label: string }[] = [
    { code: "en", label: "English" },
    { code: "uk", label: "Українська" },
  ];
  return (
    <ul className="grid grid-cols-1 gap-0.5">
      {options.map((o) => (
        <li key={o.code}>
          <button
            type="button"
            onClick={() => setLocale(o.code)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors",
              locale === o.code ? "bg-white/70 font-semibold" : "hover:bg-white/50",
            )}
          >
            <span>{o.label}</span>
            {locale === o.code && <Check size={14} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CurrencyChoices({
  current, supported, symbols, onPick,
}: {
  current: CurrencyCode;
  supported: CurrencyCode[];
  symbols: Record<CurrencyCode, string>;
  onPick: (c: CurrencyCode) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-0.5">
      {supported.map((c) => (
        <li key={c}>
          <button
            type="button"
            onClick={() => onPick(c)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
              current === c ? "bg-white/70 font-semibold" : "hover:bg-white/50",
            )}
          >
            <span>
              <span className="mr-1 inline-block w-6 text-ink-secondary">{symbols[c]}</span>
              {c}
            </span>
            {current === c && <Check size={12} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

function MenuItem({
  icon, label, onClick, tone = "default",
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-glass px-3 py-2 text-left transition-colors",
        tone === "danger"
          ? "text-orange-deep hover:bg-orange-soft/60"
          : "text-ink-primary hover:bg-white/60",
      )}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
