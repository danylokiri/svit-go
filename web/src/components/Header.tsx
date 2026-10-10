import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Bookmark,
  Check,
  Coins,
  GitCompare,
  Globe,
  Heart,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Sparkles,
  Sun,
  Ticket,
  User as UserIcon,
  Crown,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useOrganizerAuth } from "@/auth/OrganizerContext";
import { useTheme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import type { CurrencyCode } from "@/api";
import { getCompareIds } from "@/lib/compare";

export default function Header() {
  const { t } = useI18n();
  const scrolled = useScrolledPast(24);
  return (
    <header className={cn(
      "fixed left-0 right-0 top-0 z-30 px-4 transition-all duration-300",
      // Tighter top inset + thicker glass once the user starts scrolling so
      // the bar reads as "pinned" instead of "floating loosely above". This
      // is the iOS Liquid Glass move — the chrome doesn't move out of the
      // way, it densifies.
      scrolled ? "pt-2" : "pt-4",
    )}>
      <div className={cn(
        "mx-auto flex max-w-7xl items-center justify-between rounded-pill px-4 transition-all duration-300",
        // Switch from default `glass` to the heavier `glass-strong` once
        // the page surface is moving behind it — keeps the underlying
        // content readable through the blur.
        scrolled ? "glass-strong h-16 shadow-glass-lg" : "glass h-20",
      )}>
        {/* Logo */}
        <Link to="/" aria-label="SvitGo" className="flex items-center gap-2 pl-2">
          <img
            src="/logo-full.svg"
            alt="SvitGo"
            className={cn(
              "w-auto transition-all duration-300",
              scrolled ? "h-10 md:h-11" : "h-12 md:h-14",
            )}
          />
        </Link>

        {/* Center nav — md+ only */}
        <nav className="hidden items-center gap-1 md:flex">
          <NavItem to="/catalog">{t("nav.catalog")}</NavItem>
          <NavLink
            to="/ai"
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-blue-primary text-white"
                  : "btn-soft"
              )
            }
          >
            <MessageCircle size={14} />
            {t("nav.askAI")}
          </NavLink>
          <CompareNavLink />
        </nav>

        {/* Right cluster: mobile-only quick toggles + mobile nav + user menu.
            On md+ language/currency/theme live INSIDE the user dropdown so
            the header stays light. */}
        <div className="flex items-center gap-1.5">
          <div className="md:hidden">
            <ThemeToggle />
          </div>
          <MobileNav />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

/** Tiny compare counter — shows only if user added tours to compare. */
function CompareNavLink() {
  const [count, setCount] = useState(() => getCompareIds().length);
  // Bumped on every INCREASE — used as a key on the chip so the bounce
  // animation re-fires per add. Decrements (user un-comparing) don't
  // bounce — only "you added something" gets the cheerful tap.
  const [addBumps, setAddBumps] = useState(0);
  const { t } = useI18n();
  useEffect(() => {
    function onStorage() {
      const next = getCompareIds().length;
      setCount((prev) => {
        if (next > prev) setAddBumps((b) => b + 1);
        return next;
      });
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("svitgo:compare-change", onStorage as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("svitgo:compare-change", onStorage as EventListener);
    };
  }, []);
  if (count < 1) return null;
  return (
    <NavLink
      to="/compare"
      className={({ isActive }) =>
        cn(
          "inline-flex items-center gap-1.5 rounded-pill px-3 py-2 text-sm font-semibold transition-colors",
          isActive
            ? "bg-white/85 text-ink-primary shadow-soft"
            : "bg-white/40 text-ink-primary hover:bg-white/70",
        )
      }
    >
      <GitCompare size={14} />
      {t("nav.compare")}
      <span
        key={addBumps}
        className="counter-bounce ml-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-blue-primary px-1 text-[10px] font-bold text-white"
      >
        {count}
      </span>
    </NavLink>
  );
}

/**
 * Hamburger dropdown for screens below `md`.
 */
function MobileNav() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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

  return (
    <div ref={containerRef} className="relative md:hidden">
      <button
        type="button"
        aria-label={t("menu.openMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-full text-ink-primary hover:bg-white/60"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          role="menu"
          className="glass-strong animate-pop-in absolute right-0 top-12 z-40 w-56 rounded-glass p-2 text-sm shadow-glass-lg"
        >
          <NavLink
            to="/catalog"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-3 rounded-glass px-3 py-2 transition-colors",
                isActive ? "bg-white/70 text-ink-primary" : "hover:bg-white/60"
              )
            }
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70">
              <Bookmark size={14} />
            </span>
            <span className="font-medium">{t("nav.catalog")}</span>
          </NavLink>
          <NavLink
            to="/ai"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-3 rounded-glass px-3 py-2 transition-colors",
                isActive ? "bg-white/70 text-ink-primary" : "hover:bg-white/60"
              )
            }
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-orange-accent text-white">
              <MessageCircle size={14} />
            </span>
            <span className="font-medium">{t("nav.askAI")}</span>
          </NavLink>
          <NavLink
            to="/compare"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-3 rounded-glass px-3 py-2 transition-colors",
                isActive ? "bg-white/70 text-ink-primary" : "hover:bg-white/60"
              )
            }
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70">
              <GitCompare size={14} />
            </span>
            <span className="font-medium">{t("nav.compare")}</span>
          </NavLink>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
          isActive
            ? "bg-white/85 text-ink-primary shadow-soft"
            : "text-ink-secondary hover:bg-white/30 hover:text-ink-primary"
        )
      }
    >
      {({ isActive }) => (
        <span className="inline-flex items-center gap-1.5">
          {isActive && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-primary" />
          )}
          {children}
        </span>
      )}
    </NavLink>
  );
}

/** Light / dark toggle — only used in the mobile header now. */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const isDark = theme === "dark";
  const label = isDark ? t("theme.toLight") : t("theme.toDark");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-10 w-10 place-items-center rounded-full text-ink-primary transition-colors hover:bg-white/60"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState<"lang" | "currency" | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { organizer, logout: orgLogout } = useOrganizerAuth();
  const { t, locale, setLocale } = useI18n();
  const { currency, setCurrency, supported, symbols } = useCurrency();
  const { tier } = useSubscription();
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSubOpen(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSubOpen(null);
      }
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

  function go(path: string) {
    setOpen(false);
    setSubOpen(null);
    navigate(path);
  }
  function onLogout() {
    setOpen(false);
    logout();
    navigate("/");
  }

  // Anonymous: a Sign-in button + a tiny dropdown for lang/currency/theme.
  if (!user) {
    return (
      <div ref={containerRef} className="relative flex items-center gap-1.5">
        <AnonPrefsButton
          open={open}
          setOpen={setOpen}
          subOpen={subOpen}
          setSubOpen={setSubOpen}
          locale={locale}
          setLocale={setLocale}
          currency={currency}
          setCurrency={setCurrency}
          supported={supported}
          symbols={symbols}
          theme={theme}
          toggleTheme={toggleTheme}
          t={t}
        />
        <Link to="/auth" className="btn btn-primary px-4 py-2 text-sm">
          <LogIn size={16} />
          {t("nav.signIn")}
        </Link>
      </div>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  const tierBadge =
    tier === "pro" ? { label: "PRO", className: "bg-orange-accent text-white" } :
    tier === "plus" ? { label: "PLUS", className: "bg-blue-primary text-white" } :
    null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen((o) => !o); setSubOpen(null); }}
        className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-orange-accent text-sm font-bold text-white transition-transform hover:scale-105"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="glass-strong animate-pop-in absolute right-0 top-12 z-40 w-72 rounded-glass p-2 text-sm shadow-glass-lg"
        >
          {/* Profile header card */}
          <div className="flex items-center gap-3 rounded-glass px-3 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-blue-primary to-orange-accent text-white font-bold">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate font-semibold">{user.name}</div>
                {tierBadge && (
                  <span className={cn("rounded-pill px-1.5 py-0.5 text-[10px] font-bold tracking-wider", tierBadge.className)}>
                    {tierBadge.label}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-ink-secondary">{user.email}</div>
            </div>
          </div>

          <div className="my-1 h-px bg-white/50" />

          <MenuItem icon={<Ticket size={16} />}    label={t("menu.bookings")}   onClick={() => go("/account?tab=bookings")} />
          <MenuItem icon={<Heart size={16} />}     label={t("menu.saved")}      onClick={() => go("/account?tab=saved")} />
          <MenuItem icon={<Sparkles size={16} />}  label={t("menu.aiPrefs")}    onClick={() => go("/account?tab=ai")} />
          <MenuItem icon={<Crown size={16} />}     label={t("menu.subscription")} onClick={() => go("/pricing")} />
          <MenuItem icon={<UserIcon size={16} />}  label={t("menu.profile")}    onClick={() => go("/account?tab=profile")} />

          <div className="my-1 h-px bg-white/50" />

          {/* Preferences: language + currency + theme */}
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

          {/* Organizer cabinet — visible ONLY if the user is ALSO signed in
              as an operator (separate token). We don't push an "Operator
              login" link to authenticated travellers here — it would be
              noise. Operators reach their login from the signed-out AuthPage
              footer or directly via /organizer/login. */}
          {organizer && (
            <>
              <div className="my-1 h-px bg-white/50" />
              <MenuItem
                icon={<Briefcase size={16} />}
                label={t("menu.organizerCabinet")}
                onClick={() => go("/organizer")}
              />
              <MenuItem
                icon={<LogOut size={16} />}
                label={t("menu.signOutOrganizer")}
                onClick={() => { orgLogout(); }}
              />
            </>
          )}

          <div className="my-1 h-px bg-white/50" />

          <MenuItem
            icon={<LogOut size={16} />}
            label={t("menu.signOut")}
            onClick={onLogout}
            tone="danger"
          />
        </div>
      )}
    </div>
  );
}

/** Anonymous-state dropdown — exposes prefs without forcing login. */
function AnonPrefsButton(props: {
  open: boolean;
  setOpen: (b: boolean) => void;
  subOpen: "lang" | "currency" | null;
  setSubOpen: (v: "lang" | "currency" | null) => void;
  locale: ReturnType<typeof useI18n>["locale"];
  setLocale: ReturnType<typeof useI18n>["setLocale"];
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  supported: CurrencyCode[];
  symbols: Record<CurrencyCode, string>;
  theme: "dark" | "light";
  toggleTheme: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { open, setOpen, subOpen, setSubOpen, locale, setLocale, currency, setCurrency, supported, symbols, theme, toggleTheme, t } = props;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setSubOpen(null); }}
        aria-label={t("menu.preferences")}
        className="hidden h-10 w-10 place-items-center rounded-full text-ink-primary transition-colors hover:bg-white/60 md:grid"
      >
        <Globe size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-strong animate-pop-in absolute right-0 top-12 z-40 w-64 rounded-glass p-2 text-sm shadow-glass-lg"
        >
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
            <CurrencyChoices current={currency} supported={supported} symbols={symbols} onPick={(c) => { setCurrency(c); setSubOpen(null); }} />
          </SubmenuRow>
          <MenuItem
            icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
            onClick={() => toggleTheme()}
          />
        </div>
      )}
    </div>
  );
}

function SubmenuRow({
  icon,
  label,
  value,
  active,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
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
  locale,
  setLocale,
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
  current,
  supported,
  symbols,
  onPick,
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
  icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
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
          : "text-ink-primary hover:bg-white/60"
      )}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

/**
 * Window-scroll tracker. Toggles true once the user has scrolled more than
 * `threshold` pixels — used by the header to densify itself once the page
 * surface starts moving behind it.
 */
function useScrolledPast(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(() =>
    typeof window !== "undefined" ? window.scrollY > threshold : false,
  );
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}
