import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface Props {
  departures: string[];           // ISO YYYY-MM-DD (future-only, ascending)
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  /** Quick-pick chips above the dropdown — first N visible without opening. */
  quickPickCount?: number;
}

/**
 * Compact departure date picker. Why custom instead of `<select>` or chip-grid:
 *
 *   - `<select>` lists 30+ items as a flat OS popup → ugly, unscannable.
 *   - Chip-grid grows linearly with number of departures — fine for 5,
 *     useless for 50 (the user explicitly called this out: "а вдруг даты
 *     отправления расписаны на 10 лет вперед, там сколько тогда там вариков
 *     будет?").
 *   - This component shows the first 4 dates as quick-pick chips and hides
 *     the rest inside a scrollable popover with the same chip styling.
 *     Searchable: typing filters by month/year.
 *
 * Keyboard: Esc closes, click outside closes.
 */
export default function DeparturePicker({
  departures,
  value,
  onChange,
  placeholder,
  quickPickCount = 4,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) {
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visibleChips = departures.slice(0, quickPickCount);
  const hasMore = departures.length > quickPickCount;
  const filtered = query
    ? departures.filter((iso) =>
        formatLong(iso).toLowerCase().includes(query.toLowerCase()),
      )
    : departures;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-2">
        {visibleChips.map((iso) => {
          const on = iso === value;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(on ? null : iso)}
              className={cn(
                "chip transition-all duration-200",
                on ? "bg-blue-primary text-white" : "chip-cream hover:bg-white",
              )}
            >
              {formatShort(iso)}
            </button>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "chip inline-flex items-center gap-1 transition-all duration-200",
              value && !visibleChips.includes(value)
                ? "bg-blue-primary text-white"
                : "chip-cream hover:bg-white",
            )}
          >
            <Calendar size={13} />
            {value && !visibleChips.includes(value)
              ? formatShort(value)
              : t("departurePicker.more", { n: String(departures.length - quickPickCount) })}
            <ChevronDown size={12} className="opacity-70" />
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          className="glass-strong absolute left-0 top-full z-30 mt-2 w-72 rounded-glass p-3 shadow-glass-lg"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder ?? t("departurePicker.search")}
            autoFocus
            className="w-full rounded-glass bg-white/60 px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus:bg-white/80"
          />
          <ul className="mt-2 max-h-72 overflow-y-auto" role="listbox">
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-ink-muted">
                {t("departurePicker.empty")}
              </li>
            )}
            {filtered.map((iso) => {
              const on = iso === value;
              return (
                <li key={iso}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => { onChange(iso); setOpen(false); setQuery(""); }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-glass px-3 py-2 text-left text-sm transition-colors",
                      on ? "bg-blue-primary/15 font-semibold text-blue-deep" : "hover:bg-white/60",
                    )}
                  >
                    <span>{formatLong(iso)}</span>
                    {on && <Check size={14} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function formatLong(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
