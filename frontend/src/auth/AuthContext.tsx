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
import { ApiError, invalidateSession, onUnauthorized, resetCsrfToken } from "../api/http";
import { UserRole } from "../types/api";
import type { LoginRequest, MeResponse } from "../types/api";

/**
 * Identitaet und Rolle stammen ausschliesslich aus GET /api/auth/me
 * (autoritative Serverantwort: ID, Benutzername, Rolle). Der Client fuehrt
 * die Ermittlung einmalig pro Sitzung (Login oder wiederhergestellte
 * Sitzung) durch und cached das Ergebnis im sessionStorage, damit ein
 * Neuladen nicht erneut eine Identitaetsabfrage ausloest. Bei HTTP 401
 * verwirft der http-Listener die Sitzung; es wird niemals eine Identitaet
 * aus Benutzernamen oder anderen Daten abgeleitet.
 */
interface AuthContextValue {
  /** Autoritative Benutzer-ID aus /auth/me; null, solange unbekannt. */
  userId: number | null;
  username: string | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  /** false, solange /api/auth/me die Identitaet noch nicht bestaetigt hat. */
  identityKnown: boolean;
  login: (request: LoginRequest) => Promise<void>;
  /** Serverseitiger Cookie-Logout; danach lokaler Status-Reset. */
  logout: () => Promise<void>;
  /** Rein clientseitiger Status-Reset; ohne Serveraufruf. */
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "sims.auth";

interface StoredAuth {
  /** Autoritative ID aus /auth/me; null, solange noch nicht bestaetigt. */
  id: number | null;
  username: string | null;
  /** Bekannte Rolle, oder null wenn noch nicht ueber die API ermittelt. */
  isAdmin: boolean | null;
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (typeof parsed?.username !== "string" || parsed.username === "") return null;
    // ID und Rolle nur explizite Werte uebernehmen; sonst null, damit eine
    // wiederhergestellte Sitzung die Identitaetsermittlung erneut ausloest.
    return {
      id: typeof parsed.id === "number" && Number.isInteger(parsed.id) ? parsed.id : null,
      username: parsed.username,
      isAdmin: parsed.isAdmin === true ? true : parsed.isAdmin === false ? false : null
    };
  } catch {
    return null;
  }
}

function persist(next: StoredAuth | null): void {
  if (next === null) {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

/**
 * Tolerante Rollenauswertung fuer GET /auth/me: Die API serialisiert die
 * Rolle nachweislich als String ("User"/"Administrator"). Numerische
 * Darstellung (enum-Wert) wird zusaetzlich akzeptiert. Ein unbekanntes
 * Rollenschema fuehrt zu null (= unbekannt) und loest eine erneute
 * Identitaetsermittlung aus; niemals wird die Admin-Rolle angenommen.
 */
function parseAdminRole(role: MeResponse["role"]): boolean | null {
  if (typeof role === "string") {
    if (role === "Administrator") return true;
    if (role === "User") return false;
    return null;
  }
  if (role === UserRole.Administrator) return true;
  if (role === UserRole.User) return false;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());

  // Verhindert Doppelanfragen der Identitaetsermittlung (React-StrictMode);
  // wird pro Sitzungssatz (Login/Logout/Session-Reset) zurueckgesetzt.
  const probeRef = useRef(false);
  const probeOwnerRef = useRef<string | null>(null);

  // Bei 401 (Ablauf nach 30 min, ohne Sliding Expiration) Session verwerfen:
  // ohne gueltige Sitzung darf keine Identitaet mehr angenommen werden.
  useEffect(() => onUnauthorized(() => setAuth(null)), []);

  const login = useCallback(async (request: LoginRequest) => {
    await authApi.login(request);
    // Login eroeffnet serverseitig eine neue (authentifizierten) Sitzung. Der
    // ggf. gecachte CSRF-Token gehoert zur anonymen Sitzung davor und ist mit
    // dem neuen Authentifizierungs-Cookie nicht mehr gueltig -> verwerfen,
    // damit der naechste schreibende Aufruf einen frischen Token holt.
    resetCsrfToken();
    // Identitaet (ID/Rolle) ist nach dem Login noch unbekannt; sie wird
    // automatisch ueber GET /api/auth/me ermittelt (siehe unten).
    const next: StoredAuth = { id: null, username: request.username, isAdmin: null };
    persist(next);
    probeRef.current = false;
    setAuth(next);
  }, []);

  const clearSession = useCallback(() => {
    persist(null);
    probeRef.current = false;
    invalidateSession();
    setAuth(null);
  }, []);

  // Serverseitiger Cookie-Logout. Bei Erfolg (HTTP 200) und auch bei 401
  // (Sitzung bereits abgelaufen) wird die lokale Session verworfen; bei
  // sonstigen Fehlern (Netzwerk/5xx) bleibt sie bestehen, damit der
  // Benutzer erneut versuchen kann, sich abzumelden.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      resetCsrfToken();
      clearSession();
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        clearSession();
      } else {
        throw error;
      }
    }
  }, [clearSession]);

  // Identitaetsermittlung: GET /api/auth/me liefert die autoritative ID,
  // den Benutzernamen und die Rolle der aktuellen Sitzung. Laeuft automatisch
  // bei jeder Sitzung (auch wiederhergestellten) mit unbekannter Identitaet.
  // Das Once-Flag verhindert Doppelanfragen durch React-StrictMode; bei einem
  // ungueltigen Ergebnis (Netzwerk/Timeout) bleibt alles unbekannt und wird
  // spaetestens nach einem Neuladen erneut geprueft. Ein 401 loescht ueber den
  // unauthorized-Listener die gesamte Session (kein Identitaets-Annahme).
  useEffect(() => {
    // Gilt pro Sitzung: eine neue/anonym -> angemeldet-Umgebung hebt das
    // Einmal-Flag auf (ersetzt Login-Logout-Zyklen ohne Neuladen).
    if (probeOwnerRef.current !== auth?.username) {
      probeOwnerRef.current = auth?.username ?? null;
      probeRef.current = false;
    }
    if (probeRef.current) return;
    if (auth === null || auth.id !== null) return;
    probeRef.current = true;

    const controller = new AbortController();

    authApi
      .getMe(controller.signal)
      .then((me) => {
        const isAdmin = parseAdminRole(me.role);
        if (typeof me.id !== "number" || isAdmin === null) {
          // Unbekanntes Antwort-/Rollenschema: keine Identitaet annehmen,
          // Probe fuer einen erneuten Versuch freigeben.
          probeRef.current = false;
          return;
        }
        const next: StoredAuth = {
          id: me.id,
          username: me.username,
          isAdmin
        };
        persist(next);
        setAuth(next);
      })
      .catch((error: unknown) => {
        // 401: sessionListener hat auth bereits geloescht; Flag bleibt auf
        // true, eine neue Sitzung setzt es beim naechsten Login zurueck.
        if (error instanceof ApiError && error.isUnauthorized) return;
        // Netzwerkfehler/Timeout/sonstiges: keine Identitaets-Aussage; Probe
        // fuer einen erneuten Versuch freigeben (alles bleibt unbekannt).
        probeRef.current = false;
      });

    return () => controller.abort();
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId: auth?.id ?? null,
      username: auth?.username ?? null,
      isAdmin: auth?.isAdmin === true,
      isAuthenticated: auth !== null,
      identityKnown: auth !== null && auth.id !== null && auth.isAdmin !== null,
      login,
      logout,
      clearSession
    }),
    [auth, login, logout, clearSession]
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
