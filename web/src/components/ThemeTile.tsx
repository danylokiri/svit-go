import { Link } from "react-router-dom";

interface Props {
  emoji: string;
  label: string;
  gradient: string;
  to?: string;
}

/**
 * Theme tile — emoji + label on a bright pastel gradient. The gradient is
 * tuned for the cream light-theme background; in dark mode the
 * `.tinted-bg` utility dims it via an inset ::after overlay so the tile
 * reads as part of the dark page rather than a glowing sticker.
 */
export default function ThemeTile({ emoji, label, gradient, to = "/catalog" }: Props) {
  return (
    <Link
      to={to}
      className="tinted-bg group block overflow-hidden rounded-glass border border-white/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-glass-lg"
      style={{ background: gradient }}
    >
      <div className="text-4xl drop-shadow-sm">{emoji}</div>
      <div className="mt-3 text-lg font-semibold text-ink-primary">{label}</div>
    </Link>
  );
}
