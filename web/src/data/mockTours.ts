// Static UI data (themes for filter chips, cities for the world-map hero).
// Tour records themselves live in the backend (server/prisma) and are fetched
// via the /api/tours endpoint. Type aliases are re-exported from @/api for
// historical import compatibility.

export type { Theme, Tour } from "@/api/types";
import type { Theme } from "@/api/types";

export const themes: {
  id: Theme;
  label: string;
  description: string;
  emoji: string;
  gradient: string;
}[] = [
  { id: "water",     label: "water",     description: "sea, beaches, reef",   emoji: "🌊", gradient: "linear-gradient(135deg, #BFD9FF, #5B8FF9)" },
  { id: "mountains", label: "mountains", description: "peaks, trails",         emoji: "⛰️", gradient: "linear-gradient(135deg, #DCE6F5, #8FA8C9)" },
  { id: "snow",      label: "snow",      description: "skis, snowboard",       emoji: "❄️", gradient: "linear-gradient(135deg, #EAF3FF, #BFD9FF)" },
  { id: "temples",   label: "temples",   description: "temples, culture",      emoji: "🏯", gradient: "linear-gradient(135deg, #FFE0BD, #FFA94D)" },
  { id: "food",      label: "food",      description: "gastro tours",          emoji: "🍜", gradient: "linear-gradient(135deg, #FFD0B0, #FF8A4C)" },
  { id: "market",    label: "market",    description: "souks, shopping",       emoji: "🛍️", gradient: "linear-gradient(135deg, #FFE7D6, #FFB37A)" },
  { id: "wellness",  label: "wellness",  description: "spa, yoga, detox",      emoji: "🧘", gradient: "linear-gradient(135deg, #DFF5E4, #8FD0A5)" },
  { id: "adventure", label: "adventure", description: "safari, rafting",       emoji: "🏕️", gradient: "linear-gradient(135deg, #FFDCC0, #E07B3A)" },
  { id: "romantic",  label: "romantic",  description: "couples, honeymoon",    emoji: "💐", gradient: "linear-gradient(135deg, #FFD3DD, #FF8AA0)" },
  { id: "family",    label: "family",    description: "family-friendly",       emoji: "👨‍👩‍👧", gradient: "linear-gradient(135deg, #FFEFC2, #FFC85B)" },
  { id: "cities",    label: "cities",    description: "city breaks",           emoji: "🏙️", gradient: "linear-gradient(135deg, #E2E8F5, #8FA8C9)" },
  { id: "nature",    label: "nature",    description: "parks, nature",         emoji: "🌿", gradient: "linear-gradient(135deg, #DFF5E4, #5BC79A)" },
];

// NOTE: `popularCities` used to live here as a hardcoded list for the world
// map hero, but the map now reads real city data from /api/tours/map-data
// (whichever cities have tours). The export was removed to avoid drift.
