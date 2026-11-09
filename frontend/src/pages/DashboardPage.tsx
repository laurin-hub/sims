import { useCallback, useEffect, useState } from "react";
import { incidentsApi } from "../api/endpoints";
import { ApiError } from "../api/http";
import { IncidentStatus, Severity } from "../types/api";
import type { IncidentResponse } from "../types/api";
import { severityCss, severityLabel, statusCss, statusLabel } from "../utils/labels";
import "./DashboardPage.css";

interface ChartRowProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

/** Horizontaler Balken: Spur (100 %) + Fuellung (Anteil) + Zaehler. */
function BarRow({ label, count, total, color }: ChartRowProps) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="chart-row">
      <span>{label}</span>
      <svg
        className="chart-track"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${count}`}
      >
        <rect className="chart-fill" width={`${pct}%`} height="100%" fill={color} />
      </svg>
      <span className="chart-count">{count}</span>
    </div>
  );
}

interface KpiCardProps {
  value: number;
  label: string;
}

function KpiCard({ value, label }: KpiCardProps) {
  return (
    <div className="panel kpi-card">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

const STATUS_ROWS: ReadonlyArray<{ status: IncidentStatus; color: string }> = [
  { status: IncidentStatus.New, color: "#5fb2ff" },
  { status: IncidentStatus.Active, color: "#f2b53c" },
  { status: IncidentStatus.Closed, color: "#46d39a" }
];

const SEVERITY_ROWS: ReadonlyArray<{ severity: Severity; color: string }> = [
  { severity: Severity.Critical, color: "#ff5d5d" },
  { severity: Severity.High, color: "#f2b53c" },
  { severity: Severity.Medium, color: "#5fb2ff" },
  { severity: Severity.Low, color: "#8b93a3" }
];

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<IncidentResponse[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    incidentsApi
      .list(controller.signal)
      .then((data) => {
        if (!cancelled) {
          setIncidents(data);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !controller.signal.aborted) {
          setLoadError(
            error instanceof ApiError && error.message
              ? error.message
              : "Die Vorgangsdaten konnten nicht geladen werden."
          );
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tick]);

  if (loadError !== null && incidents === null) {
    return (
      <section>
        <h1 className="page-title">Einsatzübersicht</h1>
        <div className="notice notice-error banner" role="alert">
          {loadError}
        </div>
        <button type="button" className="btn btn-small" onClick={reload}>
          Erneut versuchen
        </button>
      </section>
    );
  }

  if (incidents === null) {
    return (
      <div className="loading" role="status">
        Lade Vorgangsdaten…
      </div>
    );
  }

  const total = incidents.length;
  const openCount = incidents.filter(
    (i) => i.status === IncidentStatus.New || i.status === IncidentStatus.Active
  ).length;
  const criticalHighCount = incidents.filter(
    (i) =>
      (i.severity === Severity.Critical || i.severity === Severity.High) &&
      i.status !== IncidentStatus.Closed
  ).length;
  const closedCount = incidents.filter((i) => i.status === IncidentStatus.Closed).length;

  const recent = [...incidents]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <section>
      <div className="dash-header">
        <h1 className="page-title">Einsatzübersicht</h1>
        <button type="button" className="btn btn-small" onClick={reload}>
          Aktualisieren
        </button>
      </div>

      {loadError !== null && (
        <div className="notice notice-error banner" role="alert">
          {loadError}
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard value={total} label="Gesamt" />
        <KpiCard value={openCount} label="Offen" />
        <KpiCard value={criticalHighCount} label="Kritisch / Hoch" />
        <KpiCard value={closedCount} label="Geschlossen" />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <h3 className="panel-title">Nach Status</h3>
          {STATUS_ROWS.map(({ status, color }) => (
            <BarRow
              key={status}
              label={statusLabel(status)}
              count={incidents.filter((i) => i.status === status).length}
              total={total}
              color={color}
            />
          ))}
        </div>

        <div className="panel">
          <h3 className="panel-title">Nach Schweregrad</h3>
          {SEVERITY_ROWS.map(({ severity, color }) => (
            <BarRow
              key={severity}
              label={severityLabel(severity)}
              count={incidents.filter((i) => i.severity === severity).length}
              total={total}
              color={color}
            />
          ))}
        </div>
      </div>

      <div className="panel recent-panel">
        <h3 className="panel-title">Letzte Vorfälle</h3>
        {recent.length === 0 ? (
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
                  <th>Erstellt</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((incident) => (
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
                    <td className="muted">{new Date(incident.createdAt).toLocaleString("de-DE")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
