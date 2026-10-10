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
  adminLogin as apiAdminLogin,
  fetchAdminMe,
  getAdminToken,
  setAdminToken,
  setOrgToken,
  setToken,
  type AdminMe,
} from "@/api";

/**
 * Admin auth context. Mutually exclusive with the user + organizer sessions —
 * signing in as admin wipes both other tokens and dispatches the cross-context
 * `svitgo:auth-switch` event so the other providers flush their state.
 */
interface AdminAuthState {
  admin: AdminMe | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getAdminToken()) {
      setAdmin(null);
      return;
    }
    try {
      const a = await fetchAdminMe();
      setAdmin(a);
    } catch {
      setAdminToken(null);
      setAdmin(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiAdminLogin(email, password);
    setToken(null);
    setOrgToken(null);
    setAdminToken(res.token);
    setAdmin(res.admin);
    window.dispatchEvent(new CustomEvent("svitgo:auth-switch", { detail: { to: "admin" } }));
  }, []);

  const logout = useCallback(() => {
    setAdminToken(null);
    setAdmin(null);
  }, []);

  // If the user or organizer logs in elsewhere, clear our admin state.
  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent).detail as { to?: "user" | "org" | "admin" } | undefined;
      if (detail?.to === "user" || detail?.to === "org") {
        setAdminToken(null);
        setAdmin(null);
      }
    }
    window.addEventListener("svitgo:auth-switch", onSwitch);
    return () => window.removeEventListener("svitgo:auth-switch", onSwitch);
  }, []);

  const value = useMemo<AdminAuthState>(
    () => ({ admin, loading, login, logout, refresh }),
    [admin, loading, login, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
}
