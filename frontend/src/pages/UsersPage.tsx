import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Modal from "../components/Modal";
import { resetCsrfToken } from "../api/http";
import { usersApi } from "../api/endpoints";
import { useAuth } from "../auth/AuthContext";
import { SupportLevel, UserRole } from "../types/api";
import type { CreateUserRequest, UserResponse } from "../types/api";
import { roleLabel, supportLabel } from "../utils/labels";
import "./UsersPage.css";

/** Initialwerte des Anlegeformulars. */
const EMPTY_FORM = {
  username: "",
  password: "",
  role: UserRole.User,
  supportLevel: SupportLevel.L1
};

type FormState = typeof EMPTY_FORM;

/**
 * Administrativen Benutzerverwaltung: Auflisten, Anlegen, Bearbeiten,
 * Deaktivieren und Reaktivieren. Das Backend bietet KEIN
 * Passwortwechsel-Endpunkt, das Bearbeiten aendert deshalb nur Benutzername,
 * Rolle und Support-Level.
 */
export default function UsersPage(): JSX.Element {
  const { username: currentUsername, userId: currentUserId } = useAuth();

  const [users, setUsers] = useState<UserResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<UserResponse | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserResponse | null>(null);
  // Ziel der Reaktivierung (kein Bestätigungsdialog; direkt aus der Tabelle).
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    usersApi
      .list(controller.signal)
      .then((data) => {
        if (cancelled) return;
        setUsers(data);
        setLoadError(null);
        // Identitaet und Rolle stammen autoritativ aus GET /api/auth/me
        // (AuthContext); die Benutzerliste dient hier nur der Anzeige.
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Die Benutzerliste konnte nicht geladen werden.");
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tick, currentUsername, currentUserId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    // Verhindert die native Formular-Standardaktion (GET-Submit mit Query-String).
    event.preventDefault();
    // Doppeluebermittlungen unterbinden, waehrend die Anfrage laeuft.
    if (creating) return;
    setCreating(true);
    setActionError(null);
    try {
      await usersApi.create(form as CreateUserRequest);
      setForm(EMPTY_FORM);
      setShowPassword(false);
      resetCsrfToken();
      setFlash("Benutzer wurde angelegt.");
      reload();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Der Benutzer konnte nicht angelegt werden."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setActionError(null);
    try {
      await usersApi.update(editing.id, {
        username: editing.username,
        role: editing.role,
        supportLevel: editing.supportLevel
      });
      setEditing(null);
      setFlash("Benutzer wurde aktualisiert.");
      reload();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Der Benutzer konnte nicht aktualisiert werden."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(): Promise<void> {
    if (disableTarget === null) return;
    setBusy(true);
    setActionError(null);
    try {
      await usersApi.disable(disableTarget.id);
      setDisableTarget(null);
      setFlash("Benutzer wurde deaktiviert.");
      reload();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Der Benutzer konnte nicht deaktiviert werden."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(user: UserResponse): Promise<void> {
    // Doppelklicks/Parallelanfragen unterbinden (busy deckt auch den
    // Bestätigungsdialog der Deaktivierung mit ab).
    if (busy) return;
    setBusy(true);
    setActivatingId(user.id);
    setActionError(null);
    try {
      await usersApi.activate(user.id);
      setFlash(`Benutzer '${user.username}' wurde reaktiviert.`);
      reload();
    } catch (error) {
      setActionError(
        error instanceof Error && error.message
          ? error.message
          : "Der Benutzer konnte nicht reaktiviert werden."
      );
    } finally {
      setActivatingId(null);
      setBusy(false);
    }
  }

  if (loadError !== null && users === null) {
    return (
      <section>
        <h1 className="page-title">Benutzerverwaltung</h1>
        <div className="notice notice-error banner" role="alert">
          {loadError}
        </div>
        <button type="button" className="btn btn-small" onClick={reload}>
          Erneut versuchen
        </button>
      </section>
    );
  }

  return (
    <section>
      <div className="dash-header">
        <h1 className="page-title">Benutzerverwaltung</h1>
        <button type="button" className="btn btn-small" onClick={reload}>
          Aktualisieren
        </button>
      </div>

      {flash !== null && (
        <div className="notice notice-success banner" role="status">
          {flash}
          <button
            type="button"
            className="btn btn-small notice-dismiss"
            onClick={() => setFlash(null)}
          >
            Quittieren
          </button>
        </div>
      )}
      {actionError !== null && (
        <div className="notice notice-error banner" role="alert">
          {actionError}
          <button
            type="button"
            className="btn btn-small notice-dismiss"
            onClick={() => setActionError(null)}
          >
            Quittieren
          </button>
        </div>
      )}

      <div className="users-grid">
        <form className="panel" onSubmit={(event) => void handleCreate(event)}>
          <h3 className="panel-title">Benutzer anlegen</h3>

          <div className="field">
            <label className="field-label" htmlFor="new-username">
              Benutzername
            </label>
            <input
              id="new-username"
              required
              minLength={3}
              maxLength={100}
              autoComplete="off"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <span className="field-hint">3 bis 100 Zeichen.</span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="new-password">
              Passwort
            </label>
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={12}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <span className="field-hint">Mindestens 12 Zeichen.</span>
          </div>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Passwort anzeigen
          </label>

          <div className="field">
            <label className="field-label" htmlFor="new-role">
              Rolle
            </label>
            <select
              id="new-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: Number(e.target.value) as UserRole })}
            >
              <option value={UserRole.User}>{roleLabel(UserRole.User)}</option>
              <option value={UserRole.Administrator}>{roleLabel(UserRole.Administrator)}</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="new-support">
              Support-Level
            </label>
            <select
              id="new-support"
              value={form.supportLevel}
              onChange={(e) =>
                setForm({ ...form, supportLevel: Number(e.target.value) as SupportLevel })
              }
            >
              <option value={SupportLevel.L1}>{supportLabel(SupportLevel.L1)}</option>
              <option value={SupportLevel.L2}>{supportLabel(SupportLevel.L2)}</option>
              <option value={SupportLevel.L3}>{supportLabel(SupportLevel.L3)}</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Wird angelegt…" : "Anlegen"}
          </button>
        </form>

        <div className="panel">
          <h3 className="panel-title">Benutzer</h3>
          {users === null ? (
            <div className="loading" role="status">
              Lade Benutzer…
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Benutzername</th>
                    <th>Rolle</th>
                    <th>Support-Level</th>
                    <th>Status</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="num">{user.id}</td>
                      <td>{user.username}</td>
                      <td>
                        <span
                          className={
                            user.role === UserRole.Administrator
                              ? "badge badge-admin"
                              : "badge badge-user"
                          }
                        >
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="muted">{supportLabel(user.supportLevel)}</td>
                      <td>
                        <span
                          className={
                            user.isActive
                              ? "badge badge-active-user"
                              : "badge badge-disabled"
                          }
                        >
                          {user.isActive ? "Aktiv" : "Deaktiviert"}
                        </span>
                      </td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn btn-small"
                          onClick={() => setEditing({ ...user })}
                        >
                          Bearbeiten
                        </button>
                        {user.isActive ? (
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            disabled={busy}
                            onClick={() => setDisableTarget(user)}
                          >
                            Deaktivieren
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={busy}
                            onClick={() => void handleActivate(user)}
                          >
                            {activatingId === user.id ? "Reaktivieren…" : "Reaktivieren"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing !== null && (
        <Modal
          title="Benutzer bearbeiten"
          description="Passwortwechsel sind über die API nicht vorgesehen."
          confirmLabel="Speichern"
          busy={busy}
          onClose={() => setEditing(null)}
          onConfirm={() => void handleUpdate()}
        >
          <EditUserFields
            user={editing}
            onChange={(patch) => setEditing({ ...editing, ...patch })}
          />
        </Modal>
      )}

      {disableTarget !== null && (
        <Modal
          title="Benutzer deaktivieren"
          description={`Soll '${disableTarget.username}' wirklich deaktiviert werden? Der Zugriff wird sofort entzogen. Der Benutzer kann spaeter ueber 'Reaktivieren' wieder aktiviert werden.`}
          confirmLabel="Deaktivieren"
          danger
          busy={busy}
          onClose={() => setDisableTarget(null)}
          onConfirm={() => void handleDisable()}
        />
      )}
    </section>
  );
}

interface EditUserFieldsProps {
  user: UserResponse;
  onChange: (patch: Partial<UserResponse>) => void;
}

/** Felder des Bearbeiten-Dialogs (ohne Passwort, da kein API-Endpunkt). */
function EditUserFields({ user, onChange }: EditUserFieldsProps): JSX.Element {
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="edit-username">
          Benutzername
        </label>
        <input
          id="edit-username"
          required
          minLength={3}
          maxLength={100}
          value={user.username}
          onChange={(e) => onChange({ username: e.target.value })}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="edit-role">
          Rolle
        </label>
        <select
          id="edit-role"
          value={user.role}
          onChange={(e) => onChange({ role: Number(e.target.value) as UserRole })}
        >
          <option value={UserRole.User}>{roleLabel(UserRole.User)}</option>
          <option value={UserRole.Administrator}>{roleLabel(UserRole.Administrator)}</option>
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="edit-support">
          Support-Level
        </label>
        <select
          id="edit-support"
          value={user.supportLevel}
          onChange={(e) =>
            onChange({ supportLevel: Number(e.target.value) as SupportLevel })
          }
        >
          <option value={SupportLevel.L1}>{supportLabel(SupportLevel.L1)}</option>
          <option value={SupportLevel.L2}>{supportLabel(SupportLevel.L2)}</option>
          <option value={SupportLevel.L3}>{supportLabel(SupportLevel.L3)}</option>
        </select>
      </div>
    </>
  );
}
