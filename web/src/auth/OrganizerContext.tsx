import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchOrganizerMe,
  getOrgToken,
  organizerLogin as apiOrgLogin,
  setOrgToken,
  setToken,
  type OrganizerMe,
} from "@/api";

/**
 * Parallel auth context for tour operators. Lives alongside AuthProvider —
 * an organizer's session never logs out the traveler session and vice versa,
 * because in practice the same human might run an agency AND want to book
 * personal trips. Different tokens, different localStorage keys.
 */
interface OrgAuthState {
  organizer: OrganizerMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setOrganizer: (o: OrganizerMe) => void;
}

const Ctx = createContext<OrgAuthState | null>(null);

export function OrganizerAuthProvider({ children }: { children: ReactNode }) {
  const [organizer, setOrganizer] = useState<OrganizerMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getOrgToken()) {
      setOrganizer(null);
      return;
    }
    try {
      const o = await fetchOrganizerMe();
      setOrganizer(o);
    } catch {
      setOrgToken(null);
      setOrganizer(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiOrgLogin(email, password);
    // Mutually-exclusive sessions: signing in as an operator wipes any
    // traveller token. See matching note in AuthContext.login.
    setToken(null);
    setOrgToken(res.token);
    setOrganizer(res.organizer);
    window.dispatchEvent(new CustomEvent("svitgo:auth-switch", { detail: { to: "org" } }));
  }, []);

  const logout = useCallback(() => {
    setOrgToken(null);
    setOrganizer(null);
  }, []);

  // Listen for the opposite-side login signal and flush our state. Without
  // this the in-memory `organizer` would stay populated even though the
  // localStorage token was already cleared by the other provider.
  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent).detail as { to?: "user" | "org" | "admin" } | undefined;
      if (detail?.to === "user" || detail?.to === "admin") {
        setOrgToken(null);
        setOrganizer(null);
      }
    }
    window.addEventListener("svitgo:auth-switch", onSwitch);
    return () => window.removeEventListener("svitgo:auth-switch", onSwitch);
  }, []);

  const value = useMemo<OrgAuthState>(
    () => ({ organizer, loading, login, logout, refresh, setOrganizer }),
    [organizer, loading, login, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrganizerAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrganizerAuth must be used inside <OrganizerAuthProvider>");
  return ctx;
}
