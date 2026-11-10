import { useCallback, useEffect, useState } from "react";
import Modal from "../components/Modal";
import { incidentsApi } from "../api/endpoints";
import { ApiError } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import { IncidentStatus, Severity } from "../types/api";
import type { CreateIncidentRequest, IncidentResponse } from "../types/api";
import type { FormEvent } from "react";
import { severityCss, severityLabel, statusCss, statusLabel } from "../utils/labels";
import "./IncidentsPage.css";

interface FormState {
  system: string;
  description: string;
  severity: Severity;
  cve: string;
  assigneeId: string;
}

const EMPTY_FORM: FormState = {
  system: "",
  description: "",
  severity: Severity.Medium,
  cve: "",
  assigneeId: ""
};

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

/**
 * Incident-Verwaltung: Anzeigen, Erstellen, Bearbeiten, Schliessen,
 * Eskalieren. Alle Aktionen respektieren die Backend-Regeln (Bearbeiter
 * oder Administrator darf aendern; geschlossene Incidents sind gesperrt;
 * Statuswechsel nur New -> Active; Schliessen nur ueber /close).
 */
export default function IncidentsPage(): JSX.Element {
  const { userId, isAdmin, identityKnown } = useAuth();

  const [incidents, setIncidents] = useState<IncidentResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [forbiddenNote, setForbiddenNote] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<IncidentResponse | null>(null);
  const [closing, setClosing] = useState<IncidentResponse | null>(null);
  const [escalating, setEscalating] = useState<IncidentResponse | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [reopening, setReopening] = useState<IncidentResponse | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    incidentsApi
      .list(controller.signal)
      .then((data) => {
        if (cancelled) return;
        setIncidents(data);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.isForbidden) {
          setForbiddenNote("Ihr Konto zeigt nur Vorfälle, bei denen Sie Berichterstatter oder Bearbeiter sind.");
        }
        setLoadError("Die Vorfälle konnten nicht geladen werden.");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tick]);

  /**
   * Berechtigung gemaess Backend (CanEditIncident): Bearbeiter oder
   * Administrator. Die eigene ID stammt autoritativ aus GET /api/auth/me;
   * solange sie (oder die Rolle) noch unbekannt ist, bleibt alles gesperrt
   * (Anforderung: keine unberechtigten Aktionen waehrend die Identitaet
   * noch geladen wird). Die Serverpruefung bleibt bei jeder Aktion
   * massgeblich (403 -> Fehlermeldung).
   */
  function canEdit(incident: IncidentResponse): boolean {
    if (!identityKnown) return false;
    return isAdmin || incident.assigneeId === userId;
  }

  /** Hint fuer gesperrte Aktionen (Identitaet unknown vs. Nicht-berechtigt). */
  function actionTitle(closed: boolean): string {
    if (closed) return "Geschlossene Incidents sind gesperrt.";
    if (!identityKnown) return "Identitaet wird noch ermittelt…";
    return "Diese Aktion steht nur Administratoren oder dem zugewiesenen Bearbeiter offen (Server-pruefung).";
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    // Verhindert die native Formular-Standardaktion (GET-Submit mit Query-String).
    event.preventDefault();
    // Doppeluebermittlungen unterbinden, waehrend die Anfrage laeuft.
    if (creating) return;
    const assigneeId = Number(form.assigneeId);
    if (!Number.isInteger(assigneeId) || assigneeId <= 0) {
      setActionError("Gültige Bearbeiter-ID (ganze Zahl > 0) erforderlich.");
      return;
    }
    setCreating(true);
    setActionError(null);
    try {
      await incidentsApi.create({
        assigneeId,
        severity: form.severity,
        cve: form.cve.trim() === "" ? null : form.cve.trim(),
        system: form.system.trim(),
        description: form.description.trim()
      } satisfies CreateIncidentRequest);
      setForm(EMPTY_FORM);
      setFlash("Incident wurde angelegt.");
      setActionError(null);
      reload();
    } catch (error) {
      setActionError(apiErrorMessage(error, "Der Incident konnte nicht angelegt werden."));
      setFlash(null);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setActionError(null);
    try {
      await incidentsApi.update(editing.id, {
        severity: editing.severity,
        system: editing.system,
        description: editing.description,
        cve: editing.cve,
        // Statuswechsel nur New -> Active; Schliessen nie per Update.
        status:
          editing.status === IncidentStatus.Closed
            ? null
            : editing.status === IncidentStatus.New
              ? IncidentStatus.Active
              : null
      });
      setEditing(null);
      setFlash("Incident wurde aktualisiert.");
      setActionError(null);
      reload();
    } catch (error) {
      setActionError(apiErrorMessage(error, "Der Incident konnte nicht bearbeitet werden."));
      setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    if (closing === null) return;
    setBusy(true);
    setActionError(null);
    try {
      await incidentsApi.close(closing.id);
      setClosing(null);
      setFlash("Incident wurde geschlossen.");
      setActionError(null);
      reload();
    } catch (error) {
      setActionError(apiErrorMessage(error, "Der Incident konnte nicht geschlossen werden."));
      setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleEscalate(): Promise<void> {
    if (escalating === null) return;
    const target = Number(newAssigneeId);
    if (!Number.isInteger(target) || target <= 0) {
      setActionError("Gültige Bearbeiter-ID (ganze Zahl > 0) erforderlich.");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await incidentsApi.escalate(escalating.id, { newAssigneeId: target });
      setEscalating(null);
      setNewAssigneeId("");
      setFlash("Incident wurde eskaliert.");
      setActionError(null);
      reload();
    } catch (error) {
      setActionError(apiErrorMessage(error, "Der Incident konnte nicht eskaliert werden."));
      setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen(): Promise<void> {
    if (reopening === null) return;
    const reason = reopenReason.trim();
    // Clientseitige Validierung entsprechend dem Backend (ReopenIncidentRequestDto).
    if (reason === "") {
      setActionError("Eine Begründung ist erforderlich.");
      return;
    }
    if (reason.length > 1000) {
      setActionError("Die Begründung darf höchstens 1000 Zeichen enthalten.");
      return;
    }
    // Doppeluebermittlungen waehrend der laufenden Anfrage verhindern.
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await incidentsApi.reopen(reopening.id, { reason });
      setReopening(null);
      setReopenReason("");
      setFlash(`Incident #${reopening.id} wurde wiedereröffnet.`);
      setActionError(null);
      reload();
    } catch (error) {
      setActionError(apiErrorMessage(error, "Der Incident konnte nicht wiedereröffnet werden."));
      setFlash(null);
    } finally {
      setBusy(false);
    }
  }

  if (loadError !== null && incidents === null) {
    return (
      <section>
        <h1 className="page-title">Incident-Verwaltung</h1>
        {forbiddenNote !== null && (
          <div className="notice banner" role="note">
            {forbiddenNote}
          </div>
        )}
        <div className="notice notice-error banner" role="alert">
          {loadError}
          <button
            type="button"
            className="btn btn-small notice-dismiss"
            onClick={() => {
              setLoadError(null);
              reload();
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="dash-header">
        <h1 className="page-title">Incident-Verwaltung</h1>
        <button type="button" className="btn btn-small" onClick={reload}>
          Aktualisieren
        </button>
      </div>

      {forbiddenNote !== null && (
        <div className="notice banner" role="note">
          {forbiddenNote}
        </div>
      )}
      {identityKnown && !isAdmin && incidents !== null && incidents.length > 0 && (
        <div className="notice banner" role="note">
          Als normaler Benutzer koennen Sie nur Vorfaelle bearbeiten, eskalieren
          oder schliessen, die Ihnen als Bearbeiter zugewiesen sind. Die
          Serverpruefung entscheidet verbindlich.
        </div>
      )}
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

      <div className="incidents-grid">
        <form className="panel" onSubmit={(event) => void handleCreate(event)}>
          <h3 className="panel-title">Incident erfassen</h3>

          <div className="field">
            <label className="field-label" htmlFor="inc-system">
              Betroffenes System
            </label>
            <input
              id="inc-system"
              required
              maxLength={200}
              value={form.system}
              onChange={(e) => setForm({ ...form, system: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="inc-description">
              Beschreibung
            </label>
            <textarea
              id="inc-description"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="inc-severity">
              Schweregrad
            </label>
            <select
              id="inc-severity"
              value={form.severity}
              onChange={(e) =>
                setForm({ ...form, severity: Number(e.target.value) as Severity })
              }
            >
              <option value={Severity.Critical}>{severityLabel(Severity.Critical)}</option>
              <option value={Severity.High}>{severityLabel(Severity.High)}</option>
              <option value={Severity.Medium}>{severityLabel(Severity.Medium)}</option>
              <option value={Severity.Low}>{severityLabel(Severity.Low)}</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="inc-cve">
              CVE (optional)
            </label>
            <input
              id="inc-cve"
              placeholder="CVE-2026-12345"
              value={form.cve}
              onChange={(e) => setForm({ ...form, cve: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="inc-assignee">
              Bearbeiter-ID
            </label>
            <input
              id="inc-assignee"
              type="number"
              min={1}
              step={1}
              required
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
            />
            <span className="field-hint">
              Es existiert kein Endpunkt fuer eine Bearbeiterliste; als Administrator
              finden Sie IDs in der Benutzerverwaltung.
            </span>
          </div>

          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Wird angelegt…" : "Erfassen"}
          </button>
        </form>

        <div className="panel">
          <h3 className="panel-title">Vorfälle</h3>
          {incidents === null ? (
            <div className="loading" role="status">
              Lade Vorfälle…
            </div>
          ) : incidents.length === 0 ? (
            <p className="muted">Keine Vorfälle erfasst.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>System</th>
                    <th>Schweregrad</th>
                    <th>Status</th>
                    <th>Bearbeiter</th>
                    <th>Erstellt</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => {
                    const editable = canEdit(incident);
                    const closed = incident.status === IncidentStatus.Closed;
                    return (
                      <tr key={incident.id}>
                        <td className="num">{incident.id}</td>
                        <td>{incident.system}</td>
                        <td>
                          <span className={severityCss(incident.severity)}>
                            {severityLabel(incident.severity)}
                          </span>
                        </td>
                        <td>
                          <span className={statusCss(incident.status)}>
                            {statusLabel(incident.status)}
                          </span>
                        </td>
                        <td className="num muted">{incident.assigneeId}</td>
                        <td className="muted">
                          {new Date(incident.createdAt).toLocaleString("de-DE")}
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={!editable || closed}
                            title={actionTitle(closed)}
                            onClick={() => setEditing({ ...incident })}
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            className="btn btn-small"
                            disabled={!editable || closed}
                            title={actionTitle(closed)}
                            onClick={() => {
                              setNewAssigneeId("");
                              setEscalating(incident);
                            }}
                          >
                            Eskalieren
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            disabled={!editable || closed}
                            title={actionTitle(closed)}
                            onClick={() => setClosing(incident)}
                          >
                            Schließen
                          </button>
                          {closed && isAdmin ? (
                            <button
                              type="button"
                              className="btn btn-small"
                              title="Geschlossenen Incident wiedereroeffnen (nur Administratoren)"
                              onClick={() => {
                                setReopenReason("");
                                setActionError(null);
                                setReopening(incident);
                              }}
                            >
                              Wieder öffnen
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing !== null && (
        <Modal
          title={`Incident #${editing.id} bearbeiten`}
          description="Pflichtfelder, Schweregrad und optionale CVE. Ein offener Incident wird mit dem Speichern als Aktiv bestätigt."
          confirmLabel="Speichern"
          busy={busy}
          onClose={() => setEditing(null)}
          onConfirm={() => void handleUpdate()}
        >
          <EditIncidentFields
            incident={editing}
            onChange={(patch) => setEditing({ ...editing, ...patch })}
          />
        </Modal>
      )}

      {closing !== null && (
        <Modal
          title="Incident schließen"
          description={`Soll Incident #${closing.id} (${closing.system}) wirklich geschlossen werden? Geschlossene Vorfälle können nicht erneut geoeffnet oder bearbeitet werden.`}
          confirmLabel="Schließen"
          danger
          busy={busy}
          onClose={() => setClosing(null)}
          onConfirm={() => void handleClose()}
        />
      )}

      {escalating !== null && (
        <Modal
          title={`Incident #${escalating.id} eskalieren`}
          description="Neue Bearbeiter-ID vergeben. Der Ziel-Bearbeiter muss aktiv sein und darf sich nicht vom bisherigen unterscheiden."
          confirmLabel="Eskalieren"
          danger
          busy={busy}
          onClose={() => setEscalating(null)}
          onConfirm={() => void handleEscalate()}
        >
          <div className="field">
            <label className="field-label" htmlFor="escalate-assignee">
              Neue Bearbeiter-ID
            </label>
            <input
              id="escalate-assignee"
              type="number"
              min={1}
              step={1}
              required
              autoFocus
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
            />
            <span className="field-hint">
              Bisheriger Bearbeiter: #{escalating.assigneeId}
            </span>
          </div>
        </Modal>
      )}
      {reopening !== null && (
        <Modal
          title={`Incident #${reopening.id} wiedereroeffnen`}
          description="Der Vorfall wird von Geschlossen zurueck auf Aktiv gesetzt. Eine Begruendung ist Pflicht und wird im Server-Protokoll erfasst."
          confirmLabel="Wiedereroeffnen"
          busy={busy}
          onClose={() => setReopening(null)}
          onConfirm={() => void handleReopen()}
        >
          <div className="field">
            <label className="field-label" htmlFor="reopen-reason">
              Begruendung
            </label>
            <textarea
              id="reopen-reason"
              required
              maxLength={1000}
              autoFocus
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
            />
            <span className="field-hint">
              {reopenReason.trim().length} / 1000 Zeichen. Steuerzeichen und
              Zeilenumbrueiche sind nicht erlaubt.
            </span>
          </div>
        </Modal>
      )}
    </section>
  );
}

interface EditIncidentFieldsProps {
  incident: IncidentResponse;
  onChange: (patch: Partial<IncidentResponse>) => void;
}

/** Felder des Bearbeiten-Dialogs. */
function EditIncidentFields({
  incident,
  onChange
}: EditIncidentFieldsProps): JSX.Element {
  const statusHint =
    incident.status === IncidentStatus.New
      ? "Aktivierung: Der Incident wird beim Speichern von Neu auf Aktiv gesetzt."
      : "Ein Statuswechsel ist in dieser Richtung nicht moeglich; Schliessen erfolgt ueber die Aktion Schließen.";
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="edit-system">
          Betroffenes System
        </label>
        <input
          id="edit-system"
          required
          maxLength={200}
          value={incident.system}
          onChange={(e) => onChange({ system: e.target.value })}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="edit-description">
          Beschreibung
        </label>
        <textarea
          id="edit-description"
          required
          value={incident.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="edit-severity">
          Schweregrad
        </label>
        <select
          id="edit-severity"
          value={incident.severity}
          onChange={(e) =>
            onChange({ severity: Number(e.target.value) as Severity })
          }
        >
          <option value={Severity.Critical}>{severityLabel(Severity.Critical)}</option>
          <option value={Severity.High}>{severityLabel(Severity.High)}</option>
          <option value={Severity.Medium}>{severityLabel(Severity.Medium)}</option>
          <option value={Severity.Low}>{severityLabel(Severity.Low)}</option>
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="edit-cve">
          CVE (optional)
        </label>
        <input
          id="edit-cve"
          value={incident.cve ?? ""}
          onChange={(e) => onChange({ cve: e.target.value === "" ? null : e.target.value })}
        />
        <span className="field-hint">{statusHint}</span>
      </div>
    </>
  );
}
