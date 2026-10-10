import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { useMapData } from "@/api/hooks";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/**
 * Full-bleed interactive world map hero.
 *  - Map is rendered directly on the page background (no boxed container)
 *  - Tilted slightly via rotateX → feels like the world is receding away
 *  - Countries are soft semi-transparent silhouettes, pointer-events: none
 *  - Real geography (world-atlas TopoJSON), Mercator projection
 *  - Wheel / pinch / drag / +/- buttons pan & zoom (up to 8×)
 *  - Pins drawn as pure SVG (no foreignObject / backdrop-filter) → fast
 *  - "↓ далі" button takes the user past the map if they're stuck zooming
 */

const GEO_URL = "/world.json";
const MIN_ZOOM = 1;
const MAX_ZOOM = 16;

export default function WorldMapHero() {
  const [prompt, setPrompt] = useState("");
  const [zoom, setZoom] = useState(1.7);
  const [center, setCenter] = useState<[number, number]>([15, 46]);
  // SWR-cached, "static" — won't refetch on focus / mount-after-first.
  const { data: mapData } = useMapData();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { theme } = useTheme();

  // Country fill palette — only blue tones now. Orange was used as a
  // "has tours" highlight, but we switched to: has-tours = blue hover,
  // no-tours = inert (no hover at all). Bumped alpha values for dark
  // mode so the same hues stay visible on a near-black background.
  const countryFill = theme === "dark"
    ? {
        defaultFill: "rgba(141, 173, 239, 0.18)",
        defaultStroke: "rgba(141, 173, 239, 0.35)",
        hoverFillBlue: "rgba(141, 173, 239, 0.55)",
        hoverStrokeBlue: "rgba(141, 173, 239, 0.80)",
        pressedFillBlue: "rgba(141, 173, 239, 0.70)",
      }
    : {
        defaultFill: "rgba(91, 143, 249, 0.18)",
        defaultStroke: "rgba(91, 143, 249, 0.28)",
        hoverFillBlue: "rgba(91, 143, 249, 0.50)",
        hoverStrokeBlue: "rgba(91, 143, 249, 0.70)",
        pressedFillBlue: "rgba(91, 143, 249, 0.62)",
      };

  /** Lookup: TopoJSON country name → catalog country name (for click → filter). */
  const topoToCatalog = useMemo(() => {
    const m = new Map<string, { catalogName: string; tours: number }>();
    if (mapData) {
      for (const c of mapData.countries) m.set(c.topoName, { catalogName: c.name, tours: c.tours });
    }
    return m;
  }, [mapData]);

  /** Cities to show — only those at or below current zoom tier. */
  const visibleCities = useMemo(() => {
    if (!mapData) return [];
    // Simple zoom-density rule: at zoom 1, show top-12 (most tours); at 1.6, top-30; at 2.4+, all.
    const sorted = [...mapData.cities].sort((a, b) => b.tours - a.tours);
    const limit = zoom < 1.6 ? 12 : zoom < 2.4 ? 30 : sorted.length;
    return sorted.slice(0, limit);
  }, [mapData, zoom]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = prompt.trim();
    navigate(q ? `/ai?q=${encodeURIComponent(q)}` : "/ai");
  }
  function handlePinClick(cityName: string) {
    navigate(`/ai?q=${encodeURIComponent(`I want to go to ${cityName}`)}`);
  }
  function handleCountryClick(catalogName: string) {
    navigate(`/catalog?countries=${encodeURIComponent(catalogName)}`);
  }
  function scrollPastMap() {
    document
      .getElementById("after-map")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="relative -mt-72 w-full overflow-hidden">
      <div className="relative h-[820px] [perspective:1600px] md:h-[940px] lg:h-[1020px]">
        {/* Tilted "lying back" perspective wrapper — strong forward tilt
            (origin at the bottom edge), so the bottom of the map is closest
            and biggest, top recedes and shrinks. Mask softens edges so
            silhouettes fade smoothly into the page bg. */}
        <div
          className="absolute inset-0 [transform:rotateX(20deg)] [transform-origin:50%_100%] [transform-style:preserve-3d] [will-change:transform]"
          style={{
            // No top fade — map extends fully up under the header.
            // Soft fade on bottom + sides so map melts into the page elsewhere.
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)",
            WebkitMaskComposite: "source-in",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)",
            maskComposite: "intersect",
          }}
        >
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ scale: 200, center: [10, 26] }}
            width={1920}
            height={760}
            style={{ width: "100%", height: "100%", outline: "none" }}
          >
            <defs>
              <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1E3A8A" floodOpacity="0.18" />
              </filter>
            </defs>

            <ZoomableGroup
              zoom={zoom}
              center={center}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onMoveEnd={(pos) => {
                setZoom(pos.zoom);
                setCenter(pos.coordinates as [number, number]);
              }}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const topoName = geo.properties.name as string;
                    const hit = topoToCatalog.get(topoName);
                    const hasTours = !!hit;
                    const targetName = hasTours ? hit!.catalogName : topoName;
                    const sharedTransition = "fill 0.45s cubic-bezier(0.25, 0.8, 0.25, 1), stroke 0.45s ease-out, stroke-width 0.45s ease-out";

                    // Countries WITHOUT tours: render in default fill,
                    // no hover, no pointer, no click — inert geography.
                    // Avoids dead-end clicks to an empty catalog view.
                    if (!hasTours) {
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          style={{
                            default: {
                              fill: countryFill.defaultFill,
                              stroke: countryFill.defaultStroke,
                              strokeWidth: 0.3,
                              outline: "none",
                              cursor: "default",
                              pointerEvents: "none",
                              transition: sharedTransition,
                            },
                            // hover/pressed mirror default so no visual
                            // feedback fires even if pointer-events were
                            // re-enabled by a parent.
                            hover: {
                              fill: countryFill.defaultFill,
                              stroke: countryFill.defaultStroke,
                              strokeWidth: 0.3,
                              outline: "none",
                              cursor: "default",
                              pointerEvents: "none",
                              transition: sharedTransition,
                            },
                            pressed: {
                              fill: countryFill.defaultFill,
                              outline: "none",
                              pointerEvents: "none",
                            },
                          }}
                        />
                      );
                    }

                    // Countries WITH tours: blue hover (active "we have
                    // something here" signal), clickable to the catalog.
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => handleCountryClick(targetName)}
                        style={{
                          default: {
                            fill: countryFill.defaultFill,
                            stroke: countryFill.defaultStroke,
                            strokeWidth: 0.3,
                            outline: "none",
                            cursor: "pointer",
                            pointerEvents: "auto",
                            transition: sharedTransition,
                          },
                          hover: {
                            fill: countryFill.hoverFillBlue,
                            stroke: countryFill.hoverStrokeBlue,
                            strokeWidth: 0.5,
                            outline: "none",
                            cursor: "pointer",
                            pointerEvents: "auto",
                            transition: sharedTransition,
                          },
                          pressed: {
                            fill: countryFill.pressedFillBlue,
                            outline: "none",
                            pointerEvents: "auto",
                          },
                        }}
                      />
                    );
                  })
                }
              </Geographies>

              {visibleCities.map((c) => (
                <Marker key={`${c.country}-${c.name}`} coordinates={c.coords}>
                  <CityPin
                    name={c.name}
                    hot={c.tours >= 3}
                    zoom={zoom}
                    // Light theme: deep blue accent (#1E40AF, the darker
                    // brand shade) — reads strong on the cream map.
                    // Dark theme: same blue family but the brighter primary
                    // (#5B8FF9) — visible on the dim backdrop and stays in
                    // tone with the blue country fill.
                    dotColor={theme === "dark" ? "#5B8FF9" : "#1E40AF"}
                    onClick={() => handlePinClick(c.name)}
                  />
                </Marker>
              ))}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Floating UI — sits above the tilted map and isn't transformed itself */}

        {/* AI input — centered, low on the map area */}
        <form
          onSubmit={handleSubmit}
          className="absolute inset-x-0 bottom-8 z-10 mx-auto w-[92%] max-w-xl md:bottom-12"
        >
          <div className="glass-strong flex items-center gap-2 rounded-pill p-2 pl-6 shadow-glass-lg">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("worldmap.placeholder")}
              className="flex-1 bg-transparent py-2 text-base outline-none placeholder:text-ink-muted"
            />
            <button
              type="submit"
              aria-label={t("worldmap.find")}
              title={t("worldmap.find")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-primary text-white transition-colors hover:bg-blue-deep"
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </form>

        {/* "scroll past the map" button — escape hatch if zoom blocks page scroll */}
        <button
          type="button"
          onClick={scrollPastMap}
          aria-label={t("worldmap.scroll")}
          className="absolute bottom-6 right-6 z-20 flex items-center gap-2 rounded-pill bg-white/85 px-4 py-2.5 text-sm font-semibold text-ink-primary shadow-soft transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-glass"
        >
          {t("worldmap.next")}
          <ChevronDown size={16} />
        </button>
      </div>
    </section>
  );
}

/**
 * Pin chip drawn as pure SVG — no foreignObject, no backdrop-filter.
 * Inverse scale 1/zoom keeps the chip at constant visual size at any zoom.
 */
function CityPin({
  name,
  hot,
  zoom,
  dotColor = "#1E40AF",
  onClick,
}: {
  name: string;
  hot?: boolean;
  zoom: number;
  /** Marker dot fill — passed in so we can swap on light/dark theme. */
  dotColor?: string;
  onClick: () => void;
}) {
  const inv = 1 / zoom;
  const padX = 14;
  const charW = 7.4;
  const hotDot = hot ? 12 : 0;
  const textW = name.length * charW;
  const chipW = textW + padX * 2 + hotDot;
  const chipH = 24;

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ cursor: "pointer", pointerEvents: "auto" }}
    >
      {/* Marker dot — small solid circle at the exact city coordinates.
          Used to be paired with a translucent halo, but that read as a
          disconnected "what's this dot" floating below the chip. Now the
          chip's pointer triangle (below) overlaps this dot, so the chip
          and dot read as a single pin. */}
      <circle r={3 * inv} fill={dotColor} />

      {/* Chip is lifted just enough that its triangle pointer's tip lands
          ON the dot (was -22 = visible gap, now -18 → tip at marker center). */}
      <g transform={`scale(${inv}) translate(0, -18)`}>
        <rect
          x={-chipW / 2}
          y={-chipH / 2}
          width={chipW}
          height={chipH}
          rx={chipH / 2}
          fill="#FFFFFF"
          fillOpacity={0.97}
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={1}
          filter="url(#pin-shadow)"
        />
        {hot && <circle cx={-chipW / 2 + padX} cy={0} r={3} fill="#FF8A4C" />}
        <text
          x={hot ? -chipW / 2 + padX + 10 : 0}
          y={4.5}
          textAnchor={hot ? "start" : "middle"}
          fontFamily="Inter, system-ui, sans-serif"
          fontSize={13}
          fontWeight={600}
          fill="#1A1F2E"
        >
          {name}
        </text>
        <path
          d={`M-4 ${chipH / 2} L0 ${chipH / 2 + 6} L4 ${chipH / 2} Z`}
          fill="#FFFFFF"
          fillOpacity={0.97}
        />
      </g>
    </g>
  );
}
