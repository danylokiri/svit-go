import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface Props {
  value: string;                    // YYYY-MM-DD or "" for empty
  onChange: (v: string) => void;
  min?: string;                     // YYYY-MM-DD
  max?: string;                     // YYYY-MM-DD
  placeholder?: string;
  /** Allow nulling out the value (renders a "Clear" button). */
  clearable?: boolean;
  className?: string;
}

/**
 * Glass-styled calendar replacing the native `<input type="date">`.
 *
 * Why custom: native pickers can't be styled cross-browser, look out of
 * place against our glass+blur aesthetic, and Chromium's `дд.мм.рррр`
 * placeholder + duplicate calendar icon look broken (the user explicitly
 * complained about it). This is a ~150-line popover — no extra deps.
 *
 * Layout: trigger button shows the formatted date or placeholder + a tiny
 * calendar icon. Click → popover positioned below with month navigation,
 * weekday headers, 6×7 day grid. Outside-month days are muted; today is
 * highlighted with a ring; selected day has the blue-primary background.
 *
 * Behaviour:
 *   - Click outside → close
 *   - Esc → close
 *   - Click day → select + close
 *   - "Clear" (if clearable) → wipes value + stays open
 */
const POPOVER_W = 288;   // 18rem — must match the .w-72 class on the panel
const POPOVER_H_ESTIMATE = 360; // used only to decide flip-up vs flip-down

export default function DatePopover({
  value,
  onChange,
  min,
  max,
  placeholder,
  clearable,
  className,
}: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  // The month being viewed. Defaults to the selected value's month or today.
  const [viewMonth, setViewMonth] = useState<Date>(() => parseISO(value) ?? new Date());
  // Secondary "year picker" overlay — toggled by clicking the month/year label.
  // Lets the user jump 1990 → 2025 in one tap instead of paging 35 years
  // worth of month-arrows. When open, the day grid is replaced by a 12-cell
  // year grid centered around the currently-viewed year.
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  // Top-left of the year-picker grid. Recentred whenever we enter the year
  // picker so the current year sits in the middle, but the user can page
  // back/forward in 12-year jumps from there.
  const [yearGridBase, setYearGridBase] = useState<number>(() => (parseISO(value) ?? new Date()).getFullYear() - 5);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  /** Absolute viewport-relative coords for the popover. Recomputed on open
   *  and on scroll/resize so the panel stays glued to the trigger. */
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  function recompute() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Flip up if there isn't enough room below the trigger. Without this the
    // panel pokes off the bottom of the viewport on long pages or in scroll
    // containers near the bottom.
    const spaceBelow = window.innerHeight - r.bottom;
    const placeAbove = spaceBelow < POPOVER_H_ESTIMATE && r.top > POPOVER_H_ESTIMATE;
    const top = placeAbove ? r.top - POPOVER_H_ESTIMATE - 8 : r.bottom + 8;
    // Anchor left edge to trigger, but clamp so the popover doesn't escape
    // the right edge of the viewport on narrow sidebars.
    let left = r.left;
    if (left + POPOVER_W > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - POPOVER_W - 8);
    }
    setCoords({ top, left });
  }

  // When `value` changes externally, jump the visible month to it.
  useEffect(() => {
    const d = parseISO(value);
    if (d) setViewMonth(startOfMonth(d));
  }, [value]);

  // Compute coords AFTER paint of the trigger so the rect is final. Layout
  // effect = synchronous before browser paint, so we never flash at 0,0.
  useLayoutEffect(() => {
    if (open) recompute();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      // Click inside trigger or popover → keep open.
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onResize() { recompute(); }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  const minDate = parseISO(min ?? "");
  const maxDate = parseISO(max ?? "");
  const today = stripTime(new Date());
  const selected = parseISO(value);

  const days = useMemo(() => buildGrid(viewMonth), [viewMonth]);

  const monthLabel = viewMonth.toLocaleDateString(locale === "uk" ? "uk-UA" : undefined, {
    month: "long",
    year: "numeric",
  });
  const weekdayShort = useMemo(() => {
    // Mon-first. ISO 8601 + most European locales. Build labels via Intl.
    const ref = new Date(2024, 0, 1); // Monday Jan 1, 2024
    const fmt = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : undefined, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ref);
      d.setDate(ref.getDate() + i);
      return fmt.format(d);
    });
  }, [locale]);

  function pick(d: Date) {
    if (isDisabled(d)) return;
    onChange(toISO(d));
    setOpen(false);
  }

  function isDisabled(d: Date) {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  // Bounds for the year picker — same min/max rules as for day-picking.
  // A year is disabled only if EVERY month in it falls outside the allowed
  // range; otherwise we let the user enter the year and refine by month.
  function isYearOutOfRange(y: number): boolean {
    if (minDate && y < minDate.getFullYear()) return true;
    if (maxDate && y > maxDate.getFullYear()) return true;
    return false;
  }

  const panel = open && coords && (
    <div
      ref={popoverRef}
      role="dialog"
      style={{ position: "fixed", top: coords.top, left: coords.left, width: POPOVER_W }}
      className="date-popover animate-pop-in z-[80] rounded-glass border border-white/40 p-3 shadow-glass-lg"
    >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-0.5">
              {/* Double-chevron = jump a year. Saves the user from clicking
                  "prev month" 35 times to enter a 1990 date of birth. */}
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, -12))}
                aria-label={t("date.prevYear")}
                title={t("date.prevYear")}
                className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-white/60"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                aria-label={t("date.prevMonth")}
                className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-white/60"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setYearGridBase(viewMonth.getFullYear() - 5);
                setYearPickerOpen((v) => !v);
              }}
              title={t("date.pickYear")}
              className="rounded-pill px-2 py-1 text-sm font-bold capitalize transition-colors hover:bg-white/60"
            >
              {monthLabel}
            </button>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                aria-label={t("date.nextMonth")}
                className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-white/60"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMonth(addMonths(viewMonth, 12))}
                aria-label={t("date.nextYear")}
                title={t("date.nextYear")}
                className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-white/60"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>

          {yearPickerOpen ? (
            <>
              {/* Year picker — 3×4 grid of years centered around the visible
                  year. Page back/forward in 12-year jumps with the arrows
                  at the top. */}
              <div className="mt-3 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setYearGridBase((b) => b - 12)}
                  aria-label={t("date.prevYearRange")}
                  className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/60"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-bold text-ink-secondary tabular-nums">
                  {yearGridBase} – {yearGridBase + 11}
                </span>
                <button
                  type="button"
                  onClick={() => setYearGridBase((b) => b + 12)}
                  aria-label={t("date.nextYearRange")}
                  className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-white/60"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => yearGridBase + i).map((y) => {
                  const isViewing = y === viewMonth.getFullYear();
                  const disabled = isYearOutOfRange(y);
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setViewMonth(new Date(y, viewMonth.getMonth(), 1));
                        setYearPickerOpen(false);
                      }}
                      className={cn(
                        "rounded-glass px-2 py-3 text-sm font-semibold tabular-nums transition-colors",
                        !disabled && !isViewing && "hover:bg-white/60",
                        isViewing && "bg-blue-primary text-white shadow-soft",
                        disabled && "cursor-not-allowed opacity-30",
                      )}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                {weekdayShort.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const sameMonth = d.getMonth() === viewMonth.getMonth();
                  const isSel = selected && sameDate(d, selected);
                  const isToday = sameDate(d, today);
                  const disabled = isDisabled(d);
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(d)}
                      className={cn(
                        "relative h-8 w-8 rounded-full text-sm tabular-nums transition-colors",
                        !sameMonth && "text-ink-muted/50",
                        sameMonth && !isSel && !disabled && "text-ink-primary hover:bg-white/60",
                        isSel && "bg-blue-primary font-bold text-white shadow-soft",
                        isToday && !isSel && "ring-1 ring-blue-primary/60",
                        disabled && "cursor-not-allowed opacity-30",
                      )}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {clearable && value && (
            <div className="mt-3 flex justify-between">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="rounded-pill px-3 py-1 text-xs font-semibold text-orange-deep hover:bg-orange-soft/50"
              >
                {t("date.clear")}
              </button>
              <button
                type="button"
                onClick={() => pick(today)}
                className="rounded-pill px-3 py-1 text-xs font-semibold text-blue-deep hover:bg-blue-soft/50"
              >
                {t("date.today")}
              </button>
            </div>
          )}
    </div>
  );

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-glass bg-white/60 px-4 py-2 text-sm tabular-nums outline-none transition-colors hover:bg-white/80",
          !value && "text-ink-muted",
        )}
      >
        <span>{value ? formatLong(value, locale) : (placeholder ?? t("date.placeholder"))}</span>
        <Calendar size={14} className="text-ink-muted" />
      </button>
      {/* Panel goes through a portal so it escapes any parent that has
          `overflow: hidden`, a positioned ancestor, or a glass stacking
          context — i.e. always sits on top of everything else. */}
      {panel && createPortal(panel, document.body)}
    </div>
  );
}

// --- helpers (kept inline — tiny, only used here) ---

function parseISO(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  // Local-time YYYY-MM-DD so users in any tz see the date they picked.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Builds a 42-cell grid (6 weeks × 7 days) starting on the Monday before/of
 *  the 1st of `month`. Days from neighbouring months are included so the
 *  grid is always full. */
function buildGrid(month: Date): Date[] {
  const first = startOfMonth(month);
  // Day-of-week: 0 (Sun) → 6 (Sat). Convert to Monday-first: 0..6 = Mon..Sun.
  const jsDow = first.getDay();
  const offset = (jsDow + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

function formatLong(iso: string, locale: "en" | "uk"): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return d.toLocaleDateString(locale === "uk" ? "uk-UA" : undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
