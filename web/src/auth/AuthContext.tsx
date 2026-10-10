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
  fetchMe,
  getToken,
  login as apiLogin,
  register as apiRegister,
  setOrgToken,
  setToken,
  type User,
} from "@/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch /me (e.g. after updating prefs). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const u = await fetchMe();
      setUser(u);
    } catch {
      // token bad → clear
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Cross-context: opposite side just logged in → wipe in-memory user state.
  // The org provider already cleared our localStorage token; we just sync UI.
  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent).detail as { to?: "user" | "org" | "admin" } | undefined;
      if (detail?.to === "org" || detail?.to === "admin") {
        setToken(null);
        setUser(null);
      }
    }
    window.addEventListener("svitgo:auth-switch", onSwitch);
    return () => window.removeEventListener("svitgo:auth-switch", onSwitch);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    // Mutually-exclusive sessions: signing in as a traveller wipes any
    // operator token. The user explicitly asked for the two sides to behave
    // as completely separate apps — no "logged in as both at once" surprise.
    setOrgToken(null);
    setToken(res.token);
    setUser(res.user);
    // Cross-context signal so OrganizerAuthProvider can flush its in-memory
    // state too (it can't reach into this provider directly).
    window.dispatchEvent(new CustomEvent("svitgo:auth-switch", { detail: { to: "user" } }));
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const res = await apiRegister(email, password, name);
      setOrgToken(null);
      setToken(res.token);
      setUser(res.user);
      window.dispatchEvent(new CustomEvent("svitgo:auth-switch", { detail: { to: "user" } }));
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
