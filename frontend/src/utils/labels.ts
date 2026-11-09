import { IncidentStatus, Severity, UserRole } from "../types/api";

/** Deutsche Beschriftungen fuer API-seitig numerische Enums. */

export const LABELS: Record<string, string> = {
  severity_critical: "Kritisch",
  severity_high: "Hoch",
  severity_medium: "Mittel",
  severity_low: "Niedrig",

  status_new: "Neu",
  status_active: "Aktiv",
  status_closed: "Geschlossen",

  role_user: "Benutzer",
  role_admin: "Administrator",

  support_l1: "Level 1",
  support_l2: "Level 2",
  support_l3: "Level 3"
};

export const severityLabel = (severity: Severity): string =>
  LABELS[`severity_${Severity[severity]?.toLowerCase()}`] ?? String(severity);

export const statusLabel = (status: IncidentStatus): string =>
  LABELS[`status_${IncidentStatus[status]?.toLowerCase()}`] ?? String(status);

export const roleLabel = (role: UserRole): string =>
  LABELS[role === UserRole.Administrator ? "role_admin" : "role_user"];

export const supportLabel = (level: number): string =>
  LABELS[`support_l${level + 1}`] ?? `Level ${level + 1}`;

export const severityCss = (severity: Severity): string =>
  `badge badge-${Severity[severity]?.toLowerCase()}`;

export const statusCss = (status: IncidentStatus): string =>
  `badge badge-${IncidentStatus[status]?.toLowerCase()}`;
