import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { onSessionActivity } from "../../api/http";
import "./AppLayout.css";

/** Sitzungsdauer des Backends: 30 Minuten, ohne Sliding Expiration. */
const SESSION_MS = 30 * 60_000;

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

interface SessionExpiryTimerProps {
  onExpire: () => void;
}

/**
 * Countdown ab dem Zeitpunkt der letzten Sitzungsnutzung: Das Backend setzt
 * die 30-Minuten-Gueltigkeit beim Login und erneuert sie nicht
 * (SlidingExpiration = false); jede API-Antwort erneuert das Cookie-Cookie
 * mit voller Restlaufzeit. Der Zaehler wird daher bei jeder Response
 * zurueckgesetzt (siehe api/http.ts -> notifySessionActivity()).
 */
function SessionExpiryTimer({ onExpire }: SessionExpiryTimerProps): JSX.Element {
  const { clearSession } = useAuth();

  const deadlineRef = useRef<number>(Date.now() + SESSION_MS);
  const clearSessionRef = useRef(clearSession);
  const onExpireRef = useRef(onExpire);

  // Aktuell halten, damit die Intervall-Effekte nur einmal laufen muessen.
  useEffect(() => {
    clearSessionRef.current = clearSession;
  });
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  // Jede API-Antwort verschiebt die Frist um die volle Sitzungsdaauer.
  useEffect(() => onSessionActivity(() => {
    deadlineRef.current = Date.now() + SESSION_MS;
  }), []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() >= deadlineRef.current) {
        clearSessionRef.current();
        onExpireRef.current();
      }
    }, 5000);

    return () => window.clearInterval(id);
  }, []);

  const [remainingMs, setRemainingMs] = useState<number>(SESSION_MS);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemainingMs(deadlineRef.current - Date.now());
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const expired = remainingMs <= 0;
  return (
    <div className="session-banner" role="status">
      {expired
        ? "Session abgelaufen — bitte erneut anmelden."
        : `Session endet in ${formatRemaining(remainingMs)} — melden Sie sich rechtzeitig erneut an.`}
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return "app-nav-link" + (isActive ? " active" : "");
}

/** App-Grundgeruest: Header mit Navigation, Session-Warnung und Inhalt. */
export default function AppLayout(): JSX.Element {
  const { username, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSessionEnded = useCallback(() => {
    navigate("/login", { replace: true });
  }, [navigate]);

  return (
    <>
      <header className="app-header">
        <div className="app-bar">
          <Link to="/" className="app-brand">
            SIMS
          </Link>

          <nav className="app-nav" aria-label="Hauptnavigation">
            <NavLink to="/" end className={navClass}>
              Dashboard
            </NavLink>
            <NavLink to="/incidents" className={navClass}>
              Incidents
            </NavLink>
            {isAdmin ? (
              <NavLink to="/users" className={navClass}>
                Benutzer
              </NavLink>
            ) : null}
          </nav>

          <div className="app-user muted">
            <span className="app-user-dot" aria-hidden="true" />
            {username}
          </div>
        </div>

        <SessionExpiryTimer onExpire={handleSessionEnded} />
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </>
  );
}
