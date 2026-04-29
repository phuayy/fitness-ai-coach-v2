import type { AuthResponse, ExerciseType, RepPayload, User, WorkoutSession } from "../types";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.detail ?? response.statusText ?? "Request failed";
    throw new ApiError(String(detail), response.status);
  }

  return data as T;
}

export const apiClient = {
  baseUrl: API_BASE_URL,

  health: () => request<{ status: string; environment: string }>("/health"),

  register: (email: string, password: string) =>
    request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),

  me: (token: string) => request<User>("/auth/me", {}, token),

  startSession: (exerciseType: ExerciseType, token: string) =>
    request<WorkoutSession>("/sessions/start", {
      method: "POST",
      body: JSON.stringify({ exercise_type: exerciseType })
    }, token),

  recordRep: (sessionId: number, payload: RepPayload, token: string) =>
    request<{ ok: true }>(`/sessions/${sessionId}/reps`, {
      method: "POST",
      body: JSON.stringify(payload)
    }, token),

  finishSession: (sessionId: number, totalReps: number, validReps: number, durationSeconds: number, token: string) =>
    request<WorkoutSession>(`/sessions/${sessionId}/finish`, {
      method: "POST",
      body: JSON.stringify({ total_reps: totalReps, valid_reps: validReps, duration_seconds: durationSeconds })
    }, token),

  sessions: (token: string) => request<WorkoutSession[]>("/sessions", {}, token),

  advice: (sessionId: number, token: string) => request<{ advice: string[] }>(`/advice/session/${sessionId}`, {}, token)
};
