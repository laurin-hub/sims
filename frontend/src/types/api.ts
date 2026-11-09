/**
 * TypeScript-Datenvertraege fuer die SIMS-REST-API.
 * Enums sind numerisch: Das Backend besitzt keinen StringEnumConverter,
 * deshalb serialisiert System.Text.Json Enums als Zahlen.
 */

export enum UserRole {
  User = 0,
  Administrator = 1
}

export enum SupportLevel {
  L1 = 0,
  L2 = 1,
  L3 = 2
}

export enum Severity {
  Critical = 1,
  High = 2,
  Medium = 3,
  Low = 4
}

export enum IncidentStatus {
  New = 0,
  Active = 1,
  Closed = 2
}

// --- Authentifizierung ---

export interface LoginRequest {
  username: string;
  password: string;
}

export interface MessageResponse {
  message: string;
}

export interface CsrfTokenResponse {
  requestToken: string;
}

/** Identitaet aus dem Login. Die API liefert keinen "/me"-Endpunkt. */
export interface CurrentUser {
  username: string;
}

// --- Benutzer ---

export interface UserResponse {
  id: number;
  username: string;
  role: UserRole;
  supportLevel: SupportLevel;
  isActive: boolean;
}

export interface CreateUserRequest {
  username: string; // 3-100 Zeichen, keine Steuerzeichen, kein aeusseres Leerzeichen
  password: string; // mindestens 12 Zeichen
  role: UserRole;
  supportLevel: SupportLevel;
}

export interface UpdateUserRequest {
  username: string;
  role: UserRole;
  supportLevel: SupportLevel;
}

// --- Incidents ---

export interface IncidentResponse {
  id: number;
  reporterId: number;
  assigneeId: number;
  severity: Severity;
  status: IncidentStatus;
  cve: string | null;
  system: string;
  description: string;
  /** ISO-8601 (DateTimeOffset) */
  createdAt: string;
}

export interface CreateIncidentRequest {
  assigneeId: number;
  severity: Severity;
  cve?: string | null;
  system: string;
  description: string;
}

export interface UpdateIncidentRequest {
  severity: Severity;
  system: string;
  description: string;
  cve?: string | null;
  /** Wechselt nur New -> Active; Schliessen ausschliesslich ueber /close. */
  status?: IncidentStatus | null;
}

export interface EscalateIncidentRequest {
  newAssigneeId: number;
}

/** Fehlerformat: { message } (Validierung/Konflikt) oder RFC-7807 Problem-Details. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}
