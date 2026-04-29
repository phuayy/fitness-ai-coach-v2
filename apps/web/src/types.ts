export type ExerciseType = "squat" | "pushup";

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
}

export interface WorkoutSession {
  id: number;
  exercise_type: ExerciseType;
  started_at: string;
  ended_at: string | null;
  total_reps: number;
  valid_reps: number;
  duration_seconds: number | null;
  notes: string | null;
}

export interface RepPayload {
  rep_index: number;
  is_valid: boolean;
  confidence: number;
  feedback: string;
  metrics: Record<string, unknown>;
}

export interface CoachFrameState {
  reps: number;
  validReps: number;
  stage: "idle" | "up" | "down";
  feedback: string;
  confidence: number;
  fps: number;
  backendStatus: string;
}

export interface SetRecord {
  id: string;
  action: ExerciseType;
  setNumber: number;
  validActions: number;
  totalReps: number;
  completedAt: string;
}