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
import { ApiError, invalidateSession, onUnauthorized } from "../api/http";
import { usersApi } from "../api/endpoints";
import type { LoginRequest, UserRole } from "../types/api";

/**
 * Die API liefert keinen "/me"-, Logout- oder Benutzer-nach-ID-Endpunkt.
 * Die Rolle des angemeldeten Benutzers laesst sich nurueber die Admin-only
 * Benutzerliste ermitteln. Der Client fuehrt deshalb einmalig einen
 * kostenfreien Test durch: GET /api/users liefert 200 fuer Administratoren
 * und 403 fuer normale Benutzer. Das Ergebnis wird zusaetzlich pro
 * Benutzernamen im sessionStorage gecacht (kein Passwort-/Credential-
 * Missbrauch; die Serverpruefung bleibt bei jedem Endpunkt massgeblich).
 */
interface AuthContextValue {
  username: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  /** false, solange die Rolle ueber die API noch nicht ermittelt wurde. */
  roleKnown: boolean;
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
  /** Bekannte Rolle, oder null wenn noch nicht ueber die API ermittelt. */
  isAdmin: boolean | null;
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (typeof parsed?.username !== "string") return null;
    // Nur explizite Booleans uebernehmen; alles andere = unbekannt (null),
    // damit eine wiederhergestellte Sitzung die Rollenermittlung ausloest.
    return {
      username: parsed.username,
      isAdmin: parsed.isAdmin === true ? true : parsed.isAdmin === false ? false : null
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());
  const authRef = useRef<StoredAuth | null>(auth);
  authRef.current = auth;

  // Verhindert Doppelanfragen der Rollenermittlung (React-StrictMode);
  // wird pro Sitzungssatz (Login/Logout/Session-Reset) zurueckgesetzt.
  const roleProbeRef = useRef(false);
  const probeOwnerRef = useRef<string | null>(null);

  // Bei 401 (Ablauf nach 30 min, ohne Sliding Expiration) Session verwerfen.
  useEffect(() => onUnauthorized(() => setAuth(null)), []);

  const login = useCallback(async (request: LoginRequest) => {
    await authApi.login(request);
    // Rolle ist nach dem Login unbekannt; die Rollenermittlung erfolgt
    // automatisch ueber den Benutzerlisten-Test (siehe unten).
    const next: StoredAuth = { username: request.username, isAdmin: null };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    roleProbeRef.current = false;
    setAuth(next);
  }, []);

  const clearSession = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    roleProbeRef.current = false;
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

  // Rollenermittlung: Die API bietet keinen /me-Endpunkt. GET /api/users
  // ist der einzige authentifizierte Endpunkt, dessen HTTP-Status die Rolle
  // zuverlaessig offenlegt: 200 = Administrator, 403 = normaler Benutzer.
  // Laeuft automatisch bei jeder Sitzung (auch wiederhergestellten) mit
  // unbekannter Rolle. Das Once-Flag verhindert Doppelanfragen durch
  // React-StrictMode; bei einem ungueltigen Ergebnis (Netzwerk/Timeout)
  // bleibt die Rolle unbekannt (null) und wird spaetestens nach einem
  // Neuladen erneut geprueft - niemals als Nicht-Admin gewertet.
  useEffect(() => {
    // Gilt pro Anmelder: ein neuer Eigentuemernamen hebt das Einmal-Flag auf
    // (ersetzt Login-Logout-Zyklen ohne Neuladen, auch bei gleichem Namen
    // nach Server-seitiger Rollen-Aenderung und erneutem Login).
    if (probeOwnerRef.current !== auth?.username) {
      probeOwnerRef.current = auth?.username ?? null;
      roleProbeRef.current = false;
    }
    if (roleProbeRef.current) return;
    if (auth === null || auth.isAdmin !== null) return;
    roleProbeRef.current = true;

    const controller = new AbortController();

    usersApi
      .list(controller.signal)
      .then((users) => {
        // Serverantwort ist massgeblich: eigene Rolle aus der Liste lesen.
        const me = users.find((user) => user.username === auth.username);
        if (me) {
          reportIdentity(me.username, me.role);
        } else {
          // Kein Treffer (anomale Datenlage): Probe fuer erneuten Versuch freigeben.
          roleProbeRef.current = false;
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.isForbidden) {
          // 403 = authentifiziert, aber kein Administrator (Server-Urteil).
          setAuth((current) => {
            if (!current) return current;
            const next: StoredAuth = { username: current.username, isAdmin: false };
            window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
          });
          return;
        }
        // 401 = Sitzung abgelaufen: sessionListener hat auth bereits geloescht;
        // keine rollenrelevante Aussage, Flag bleibt auf true.
        if (error instanceof ApiError && error.isUnauthorized) return;
        // Netzwerkfehler/Timeout: keine rollenrelevante Aussage; Probe fuer
        // einen erneuten Versuch freigeben (Rolle bleibt unbekannt/null).
        roleProbeRef.current = false;
      });

    return () => controller.abort();
  }, [auth, reportIdentity]);

  const value = useMemo<AuthContextValue>(
    () => ({
      username: auth?.username ?? null,
      isAdmin: auth?.isAdmin === true,
      isAuthenticated: auth !== null,
      roleKnown: auth !== null && auth.isAdmin !== null,
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
