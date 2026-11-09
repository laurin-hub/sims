import { http } from "./http";
import type {
  CreateIncidentRequest,
  CreateUserRequest,
  EscalateIncidentRequest,
  IncidentResponse,
  LoginRequest,
  MessageResponse,
  UpdateIncidentRequest,
  UpdateUserRequest,
  UserResponse
} from "../types/api";

/**
 * Repraesentiert ausschliesslich die tatsaechlich implementierten Endpunkte.
 * Es existiert KEIN Logout-, KEIN "/me"- und KEIN Passwortwechsel-Endpunkt.
 */
export const authApi = {
  /** Holt den CSRF-Token. http.ts beschafft ihn bei Bedarf ebenfalls automatisch. */
  getCsrfToken(signal?: AbortSignal): Promise<string> {
    return http
      .get<{ requestToken: string }>("/auth/csrf-token", signal)
      .then((response) => response.requestToken);
  },

  login(request: LoginRequest, signal?: AbortSignal): Promise<MessageResponse> {
    return http.post<MessageResponse>("/auth/login", request, signal);
  }
};

export const usersApi = {
  list(signal?: AbortSignal): Promise<UserResponse[]> {
    return http.get<UserResponse[]>("/users", signal);
  },

  create(request: CreateUserRequest, signal?: AbortSignal): Promise<UserResponse> {
    return http.post<UserResponse>("/users", request, signal);
  },

  update(id: number, request: UpdateUserRequest, signal?: AbortSignal): Promise<UserResponse> {
    return http.put<UserResponse>(`/users/${id}`, request, signal);
  },

  disable(id: number, signal?: AbortSignal): Promise<UserResponse> {
    return http.patch<UserResponse>(`/users/${id}/disable`, undefined, signal);
  }
};

export const incidentsApi = {
  list(signal?: AbortSignal): Promise<IncidentResponse[]> {
    return http.get<IncidentResponse[]>("/incidents", signal);
  },

  getById(id: number, signal?: AbortSignal): Promise<IncidentResponse> {
    return http.get<IncidentResponse>(`/incidents/${id}`, signal);
  },

  create(request: CreateIncidentRequest, signal?: AbortSignal): Promise<IncidentResponse> {
    return http.post<IncidentResponse>("/incidents", request, signal);
  },

  update(
    id: number,
    request: UpdateIncidentRequest,
    signal?: AbortSignal
  ): Promise<IncidentResponse> {
    return http.put<IncidentResponse>(`/incidents/${id}`, request, signal);
  },

  close(id: number, signal?: AbortSignal): Promise<IncidentResponse> {
    return http.post<IncidentResponse>(`/incidents/${id}/close`, undefined, signal);
  },

  escalate(
    id: number,
    request: EscalateIncidentRequest,
    signal?: AbortSignal
  ): Promise<IncidentResponse> {
    return http.post<IncidentResponse>(`/incidents/${id}/escalate`, request, signal);
  }
};
