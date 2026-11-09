import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { ReactNode } from "react";
import { authApi } from "../api/endpoints";
import { invalidateSession, onUnauthorized } from "../api/http";
import type { LoginRequest, UserRole } from "../types/api";

/**
 * Die API liefert keinen "/me"- oder Logout-Endpunkt. Die Rolle des
 * angemeldeten Benutzers wird deshalb aus der Benutzerliste (UsersPage)
 * uebernommen, sobald der Client sie laden darf. Vor dem ersten Laden
 * gilt konservativ "kein Admin" (Admin-Bereich ueber menueueber ueber
 * Benutzerliste erreichbar).
 */
interface AuthContextValue {
  username: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  login: (request: LoginRequest) => Promise<void>;
  /** Rein clientseitiger Status-Reset; die API bietet keinen Logout-Endpunkt. */
  clearSession: () => void;
  /** Wird gesetzt, wenn die Benutzerliste die eigene Rolle bestaetigt. */
  reportIdentity: (username: string, role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "sims.auth";

interface StoredAuth {
  username: string;
  isAdmin: boolean;
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());
  const authRef = useRef<StoredAuth | null>(auth);
  authRef.current = auth;

  // Bei 401 (Ablauf nach 30 min, ohne Sliding Expiration) Session verwerfen.
  useEffect(() => onUnauthorized(() => setAuth(null)), []);

  const login = useCallback(async (request: LoginRequest) => {
    await authApi.login(request);
    const next: StoredAuth = { username: request.username, isAdmin: false };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
  }, []);

  const clearSession = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    invalidateSession();
    setAuth(null);
  }, []);

  const reportIdentity = useCallback((username: string, role: UserRole) => {
    setAuth((current) => {
      if (!current) return current;
      const next: StoredAuth = {
        username,
        isAdmin: role === 1 /* UserRole.Administrator */
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      username: auth?.username ?? null,
      isAdmin: auth?.isAdmin ?? false,
      isAuthenticated: auth !== null,
      login,
      clearSession,
      reportIdentity
    }),
    [auth, login, clearSession, reportIdentity]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden.");
  }
  return context;
}
