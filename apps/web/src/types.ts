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

export type CloudSyncStatus = "local" | "syncing" | "synced" | "failed";

export interface RepPayload {
  rep_index: number;
  is_valid: boolean;
  confidence: number;
  feedback: string;
  metrics: Record<string, unknown>;
}

export type SetVideoStatus = "recording" | "processing" | "ready" | "failed";

export interface RepTimestampRecord {
  id: string;
  repIndex: number;
  isValid: boolean;
  timestampSeconds: number;
  timestampLabel: string;
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
  cloudId?: string;
  cloudSessionId?: string;
  syncStatus: CloudSyncStatus;
  syncError?: string;
  action: ExerciseType;
  setNumber: number;
  validActions: number;
  totalReps: number;
  completedAt: string;
  recordingStartedAt: string;
  recordingEndedAt: string | null;
  durationSeconds: number;
  repEvents: RepTimestampRecord[];
  videoStatus: SetVideoStatus;
  videoUrl?: string;
  videoMimeType?: string;
  videoError?: string;
}

export interface CloudRepEvent {
  id: string;
  repIndex: number;
  isValid: boolean;
  timestampSeconds: number;
  confidence: number;
  feedback: string;
  metrics: Record<string, unknown>;
}

export interface CloudWorkoutSet {
  id: string;
  setNumber: number;
  action: ExerciseType;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  totalReps: number;
  validReps: number;
  reps: CloudRepEvent[];
}

export interface CloudWorkoutSession {
  id: string;
  exerciseType: ExerciseType;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "finished";
  totalReps: number;
  validReps: number;
  durationSeconds: number | null;
  sets: CloudWorkoutSet[];
}
