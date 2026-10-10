/**
 * Tour compare list — stored in localStorage so it survives reloads.
 * Max 4 tours; beyond that the oldest entry is dropped.
 *
 * Components subscribe to the synthetic `svitgo:compare-change` event to
 * re-render. The Storage API only fires `storage` on OTHER tabs, so a
 * same-tab change needs the custom event.
 */
const KEY = "svitgo.compareIds";
const MAX = 4;

export function getCompareIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

export function setCompareIds(ids: string[]) {
  if (typeof window === "undefined") return;
  const trimmed = ids.slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  window.dispatchEvent(new CustomEvent("svitgo:compare-change"));
}

export function toggleCompareId(id: string): { added: boolean; ids: string[]; reachedMax: boolean } {
  const current = getCompareIds();
  if (current.includes(id)) {
    const next = current.filter((x) => x !== id);
    setCompareIds(next);
    return { added: false, ids: next, reachedMax: false };
  }
  if (current.length >= MAX) {
    return { added: false, ids: current, reachedMax: true };
  }
  const next = [...current, id];
  setCompareIds(next);
  return { added: true, ids: next, reachedMax: false };
}

export function clearCompare() {
  setCompareIds([]);
}

export const COMPARE_MAX = MAX;
