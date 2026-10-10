import { useState } from "react";
import { Calendar, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import DatePopover from "./DatePopover";

interface Props {
  from: string;          // YYYY-MM-DD or ""
  to: string;            // YYYY-MM-DD or ""
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
}

/**
 * Catalog "Departures" filter. By default only the "from" date is exposed —
 * a one-way mode that maps to "show me tours that leave on or after X".
 *
 * Tapping the "+ return window" link unfolds an end date too, so users who
 * want to fly within a narrow window can still constrain it. This mirrors
 * how flight aggregators show one-way as default with a "round-trip" toggle.
 *
 * Native `<input type="date">` is intentionally styled with our glass tokens
 * (cream background, soft border, calendar icon). A fully custom calendar
 * popover would be cleaner but adds ~30KB of date-picker library — skipped
 * for the diploma scope.
 */
export default function DepartureFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
}: Props) {
  const { t } = useI18n();
  // Auto-show the return field if it already has a value (e.g. user clicked
  // "back" with prior filter state). Otherwise default-collapsed.
  const [returnMode, setReturnMode] = useState<boolean>(!!to);

  return (
    <div className="space-y-3">
      <DateField
        label={t("catalog.filter.departFrom")}
        value={from}
        onChange={onFromChange}
      />

      {returnMode ? (
        <div className="relative">
          <DateField
            label={t("catalog.filter.departTo")}
            value={to}
            onChange={onToChange}
            min={from || undefined}
          />
          <button
            type="button"
            onClick={() => { setReturnMode(false); onToChange(""); }}
            aria-label="Remove return date"
            className="absolute right-1 top-0 grid h-7 w-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-white/60 hover:text-ink-primary"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setReturnMode(true)}
          className="inline-flex items-center gap-1.5 rounded-pill bg-white/40 px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-white/60"
        >
          <Calendar size={12} />
          {t("catalog.filter.addReturn")}
        </button>
      )}

      {(from || to) && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-orange-deep hover:text-orange-accent"
        >
          ✕ {t("catalog.clearAll")}
        </button>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
}) {
  return (
    <div className="block">
      <span className="text-xs font-semibold text-ink-secondary">{label}</span>
      <div className="mt-1">
        <DatePopover value={value} onChange={onChange} min={min} clearable />
      </div>
    </div>
  );
}
