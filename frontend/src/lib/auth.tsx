import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.get<User>("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch { /* already logged out */ }
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
    const onLoggedOut = () => setUser(null);
    window.addEventListener("cubby:logged-out", onLoggedOut);
    return () => window.removeEventListener("cubby:logged-out", onLoggedOut);
  }, [refresh]);

  return <Ctx.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</Ctx.Provider>;
}
