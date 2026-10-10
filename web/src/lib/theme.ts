/**
 * Light/dark theme management.
 *
 * Source of truth: a `data-theme` attribute on <html>. CSS reads from it.
 *
 * Selection order on boot:
 *   1. saved preference in localStorage (`svitgo.theme`)
 *   2. system preference via `prefers-color-scheme`
 *   3. light (default)
 *
 * The hook below exposes the current value + a setter that updates both
 * the DOM attribute and localStorage.
 */
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "svitgo.theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // Light is the default. We deliberately do NOT follow the OS-level
  // `prefers-color-scheme`: pilot user testing (May 2026) showed dark
  // theme has unfinished contrast in a few spots (date popup, status
  // badges) and shouldn't be served as a first impression. Users with
  // a dark-mode preference can flip the toggle in the header — that
  // choice persists in localStorage.
  return "light";
}

/**
 * Sets the `data-theme` attribute on <html>. Call this once at module load
 * (in main.tsx) so the page paints with the correct theme before any
 * React rendering — avoids a flash of light theme on dark-preference users.
 */
export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
}

/** Apply the saved/system theme synchronously. */
export function bootstrapTheme() {
  applyTheme(getInitialTheme());
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Listen for system changes when the user hasn't explicitly chosen one.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onSystemChange = () => {
      if (localStorage.getItem(STORAGE_KEY)) return; // user has a saved pref
      const next: Theme = mq.matches ? "dark" : "light";
      setThemeState(next);
      applyTheme(next);
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem(STORAGE_KEY, t);
  }
  function toggle() {
    setTheme(theme === "dark" ? "light" : "dark");
  }
  return { theme, setTheme, toggle };
}
