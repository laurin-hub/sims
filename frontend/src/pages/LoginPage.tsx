import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import "./LoginPage.css";

/**
 * Login-Seite im SIMS-Design: zentrierte Karte, anschliessend
 * Weiterleitung an die urspruenglich angeforderte Seite.
 */
export default function LoginPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ username, password });
      navigate(from, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Der Anmeldedienst ist nicht erreichbar.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-mark" aria-hidden="true" />
          SIMS
        </div>
        <p className="login-subtitle muted">Security Incident Management System</p>

        <form onSubmit={handleSubmit}>
          {error !== null ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}

          <div className="field">
            <label className="field-label" htmlFor="login-username">
              Benutzername
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="login-password">
              Passwort
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting}
          >
            Anmelden
          </button>
        </form>
      </div>
    </div>
  );
}
