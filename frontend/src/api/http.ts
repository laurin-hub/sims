import type { CsrfTokenResponse, ProblemDetails } from "../types/api";

/** Zentrale Fehlerklasse fuer alle fehlgeschlagenen API-Aufrufe. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetails;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

const BASE_URL = "/api";

/**
 * Der CSRF-Token muss fuer jede schreibende Anfrage (POST/PUT/PATCH)
 * im Header X-CSRF-TOKEN mitgesendet werden. Er wird ueber einen GET-Request
 * bezogen und bis zur naechsten Session-Invalidierung wiederverwendet.
 */
let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(`${BASE_URL}/auth/csrf-token`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new ApiError(response.status, "CSRF-Token konnte nicht abgerufen werden.");
  }
  const data = (await response.json()) as CsrfTokenResponse;
  csrfToken = data.requestToken;
  return csrfToken;
}

/** Meldet abgelaufene/ungueltige Sitzungen dem Auth-Context (Login-Redirect). */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Meldet jede erfolgreiche API-Aktivitaet (Session-Countdown-Reset). */
type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();

export function onSessionActivity(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionActivity(): void {
  sessionListeners.forEach((listener) => listener());
}

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  csrfToken = null;
  unauthorizedListeners.forEach((listener) => listener());
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.title === "string") return record.title;
    if (typeof record.detail === "string") return record.detail;
  }
  return fallback;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status === 204) return null;
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return null;
}

interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>({ method, path, body, signal }: RequestOptions): Promise<T> {
  // Das Backend verlangt CSRF fuer POST/PUT/PATCH/DELETE
  // (AutoValidateAntiforgeryTokenAttribute); DELETE bietet die API nicht an.
  const needsCsrf = method !== "GET";
  const headers: Record<string, string> = { Accept: "application/json" };

  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (needsCsrf) {
    headers["X-CSRF-TOKEN"] = csrfToken ?? (await fetchCsrfToken());
  }

  const send = (token: string | null) =>
    fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: needsCsrf && token ? { ...headers, "X-CSRF-TOKEN": token } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });

  let response = await send(csrfToken);

  // Gueltiger Request, aber Token verworfen/abgelaufen: Die Antiforgery-Middleware
  // antwortet mit 400 + "WWW-Authenticate: X-CSRF-TOKEN". Einmalig neuen Token
  // holen und die Anfrage wiederholen.
  if (
    needsCsrf &&
    response.status === 400 &&
    response.headers.get("www-authenticate")?.includes("X-CSRF-TOKEN")
  ) {
    const retryToken = await fetchCsrfToken();
    response = await send(retryToken);
  }

  if (response.status === 401) {
    notifyUnauthorized();
  } else if (response.ok) {
    notifySessionActivity();
  }

  const parsed = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractMessage(parsed, `Die Anfrage ist fehlgeschlagen (HTTP ${response.status}).`)
    );
  }

  return parsed as T;
}

/** Meldet eine abgelaufene Sitzung explizit (z. B. nach Logout-Versuchen). */
export function invalidateSession(): void {
  notifyUnauthorized();
}

/** Erzwingt das Neubeschaffen des CSRF-Tokens (z. B. nach Login). */
export function resetCsrfToken(): void {
  csrfToken = null;
}

export const http = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>({ method: "GET", path, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>({ method: "POST", path, body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>({ method: "PUT", path, body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>({ method: "PATCH", path, body, signal })
};
