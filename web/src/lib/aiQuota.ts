/**
 * Client-side anonymous AI quota guard.
 *
 * Backend tier limit for anonymous = 20/day (TIERS.free.aiDailyLimit), but a
 * *demo-friendly* product moment for SvitGo is: an anon user is treated as a
 * teaser — they get a few free taste shots, then a "register for more" wall.
 * We enforce that on the client (no JWT, no server-side identity to track
 * other than IP — and IP-based limits get awkward fast).
 *
 * Storage shape:
 *   svitgo.anonAi = { count: number, day: "YYYY-MM-DD" }
 *   resets on day change so a returning anon visitor isn't locked forever.
 */
const KEY = "svitgo.anonAi";

export const ANON_LIMIT = 5;

interface Quota {
  count: number;
  day: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function read(): Quota {
  if (typeof window === "undefined") return { count: 0, day: today() };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { count: 0, day: today() };
    const parsed = JSON.parse(raw) as Quota;
    if (parsed.day !== today()) return { count: 0, day: today() };
    return parsed;
  } catch {
    return { count: 0, day: today() };
  }
}

function write(q: Quota) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(q));
}

export function getAnonUsage(): { used: number; remaining: number; reached: boolean } {
  const q = read();
  return {
    used: q.count,
    remaining: Math.max(0, ANON_LIMIT - q.count),
    reached: q.count >= ANON_LIMIT,
  };
}

/** Increment the counter and return the new state. */
export function bumpAnonUsage(): { used: number; remaining: number; reached: boolean } {
  const q = read();
  q.count += 1;
  write(q);
  return getAnonUsage();
}

/** For dev / sign-up flow — wipe the counter (e.g. once they register). */
export function resetAnonUsage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
