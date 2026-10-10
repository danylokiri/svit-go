import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import TourCard from "@/components/TourCard";
import ThemeTile from "@/components/ThemeTile";
import GlassCard from "@/components/GlassCard";
import { themes } from "@/data/mockTours";
import { type Tour } from "@/api";
import { useTours } from "@/api/hooks";
import { softT, useI18n } from "@/lib/i18n";

// World map is interactive D3 + a 100KB TopoJSON. It's the visual hero but
// adds ~80KB of JS to the bundle. Split into its own chunk so the rest of
// the homepage paints immediately while the map streams in.
const WorldMapHero = lazy(() => import("@/components/WorldMapHero"));

export default function HomePage() {
  const { t } = useI18n();
  // SWR — list is shared with other components and cached for 60s.
  const { data } = useTours({ sort: "popular", limit: 12 });
  const tours = data?.items ?? [];

  const popularTours = tours.slice(0, 2);
  // Sale of the day rotates daily so the homepage feels alive — pick is
  // deterministic per date so all visitors see the same featured deal.
  const saleTour = pickDeal(tours);

  return (
    <>
      <Suspense fallback={<div className="h-[940px] w-full" aria-hidden />}>
        <WorldMapHero />
      </Suspense>

      {/* Popular */}
      <section id="after-map" className="mx-auto mt-24 max-w-7xl px-4">
        <SectionHeader title={t("home.popular")} link="/catalog" linkLabel={t("home.more")} />
        <div className="stagger-grid mt-8 grid gap-6 md:grid-cols-2">
          {popularTours.map((t, i) => (
            <TourCard
              key={t.id}
              tour={t}
              size="wide"
              style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
            />
          ))}
        </div>
      </section>

      {/* NOTE: the "Trending now" analytics strip used to live here but
          felt out of place — real travel sites don't show "X AI requests
          made this month" to customers. Popularity is still computed
          server-side from real activity and powers the Popular sort. */}

      {/* Themes */}
      <section className="mx-auto mt-24 max-w-7xl px-4">
        <SectionHeader
          title={t("home.themes")}
          link="/catalog"
          linkLabel={t("home.showAll")}
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((th) => (
            <ThemeTile
              key={th.id}
              emoji={th.emoji}
              label={softT(t, "theme", th.id)}
              gradient={th.gradient}
              to={`/catalog?themes=${th.id}`}
            />
          ))}
        </div>
      </section>

      {/* Sale */}
      {saleTour && saleTour.oldPrice && (() => {
        const discount = Math.round(100 - (saleTour.price / saleTour.oldPrice) * 100);
        return (
          <section className="mx-auto mt-24 max-w-7xl px-4">
            <GlassCard
              variant="strong"
              className="relative flex flex-col items-start gap-6 overflow-hidden p-10 md:flex-row md:items-center"
            >
              {/* Decorative star burst */}
              <div
                className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 45deg, #FF8A4C, #FFD0B0, #FF8A4C, #FFD0B0, #FF8A4C)",
                  filter: "blur(20px)",
                  opacity: 0.4,
                }}
              />
              <div className="relative grid place-items-center">
                <span
                  className="grid h-32 w-32 place-items-center rounded-full text-3xl font-extrabold text-white shadow-glass"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 30%, #FFA94D, #FF8A4C 70%)",
                    clipPath:
                      "polygon(50% 0%, 61% 19%, 78% 0%, 75% 27%, 100% 28%, 80% 50%, 100% 73%, 75% 75%, 78% 100%, 61% 84%, 50% 100%, 39% 84%, 22% 100%, 25% 75%, 0% 73%, 20% 50%, 0% 28%, 25% 27%, 22% 0%, 39% 19%)",
                  }}
                >
                  −{discount}%
                </span>
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-orange-deep">
                  {t("home.dealBadge")}
                </div>
                <h3 className="mt-1 text-3xl font-extrabold leading-tight md:text-4xl">
                  {saleTour.country} · {saleTour.city}
                </h3>
                <p className="mt-2 text-ink-secondary">
                  {saleTour.title} — €{saleTour.oldPrice.toLocaleString("en-US")} → <b className="text-ink-primary">€{saleTour.price.toLocaleString("en-US")}</b>
                </p>
              </div>
              <Link to={`/tour/${saleTour.id}`} className="btn btn-accent">
                {t("home.dealCta")}
                <ArrowRight size={16} />
              </Link>
            </GlassCard>
          </section>
        );
      })()}

      {/* CTA: try AI */}
      <section className="mx-auto mt-24 max-w-7xl px-4">
        <GlassCard className="relative flex flex-col items-center gap-6 p-10 text-center md:p-16">
          <h3 className="font-marker max-w-3xl text-balance text-5xl leading-tight md:text-6xl">
            {t("home.tryAi.title")}
            <span className="text-blue-deep"> {t("home.tryAi.subtitle")}</span>
            {t("home.tryAi.tail")}
          </h3>
          <Link to="/ai" className="btn btn-primary">
            {t("home.tryAi.cta")}
            <ArrowRight size={16} />
          </Link>
        </GlassCard>
      </section>
    </>
  );
}

/**
 * Pick the "deal of the day" from the discounted tours. Deterministic per
 * calendar day — uses YYYY-MM-DD as the hash seed so every visitor sees
 * the same featured offer and it rotates at midnight.
 *
 * If there are no discounted tours, falls back to the first one.
 */
function pickDeal(tours: Tour[]): Tour | undefined {
  const discounted = tours.filter((t) => t.oldPrice);
  if (discounted.length === 0) return tours[0];
  const today = new Date().toISOString().slice(0, 10); // "2026-05-24"
  let seed = 0;
  for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
  return discounted[seed % discounted.length];
}

function SectionHeader({
  title,
  link,
  linkLabel,
}: {
  title: string;
  link: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h2 className="font-marker text-5xl font-normal leading-none tracking-tight md:text-6xl">
        {title}
      </h2>
      <Link
        to={link}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-deep transition-all hover:gap-2.5"
      >
        {linkLabel}
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
