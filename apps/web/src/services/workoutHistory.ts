import { getSupabaseClient } from "../lib/supabaseClient";
import type {
  CloudRepEvent,
  CloudWorkoutSession,
  CloudWorkoutSet,
  ExerciseType,
  RepTimestampRecord
} from "../types";

type SessionStatus = "active" | "finished";

type SessionRow = {
  id: string;
  exercise_type: ExerciseType;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  total_reps: number;
  valid_reps: number;
  duration_seconds: number | null;
};

type SetRow = {
  id: string;
  session_id: string;
  set_number: number;
  action: ExerciseType;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  total_reps: number;
  valid_reps: number;
};

type RepRow = {
  id: string;
  set_id: string;
  rep_index: number;
  is_valid: boolean;
  timestamp_seconds: number;
  confidence: number;
  feedback: string;
  metrics_json: Record<string, unknown> | null;
};

export interface CreateWorkoutSessionInput {
  userId: string;
  exerciseType: ExerciseType;
  startedAt: string;
}

export interface SaveWorkoutSetInput {
  sessionId: string;
  setNumber: number;
  action: ExerciseType;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  totalReps: number;
  validReps: number;
  repEvents: RepTimestampRecord[];
  sessionTotalReps: number;
  sessionValidReps: number;
  sessionDurationSeconds: number;
}

export interface FinishWorkoutSessionInput {
  sessionId: string;
  endedAt: string;
  totalReps: number;
  validReps: number;
  durationSeconds: number;
}

function toCloudRep(row: RepRow): CloudRepEvent {
  return {
    id: row.id,
    repIndex: row.rep_index,
    isValid: row.is_valid,
    timestampSeconds: Number(row.timestamp_seconds),
    confidence: Number(row.confidence),
    feedback: row.feedback,
    metrics: row.metrics_json ?? {}
  };
}

function toCloudSet(row: SetRow, reps: CloudRepEvent[]): CloudWorkoutSet {
  return {
    id: row.id,
    setNumber: row.set_number,
    action: row.action,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: Number(row.duration_seconds),
    totalReps: row.total_reps,
    validReps: row.valid_reps,
    reps
  };
}

function toCloudSession(
  row: SessionRow,
  sets: CloudWorkoutSet[]
): CloudWorkoutSession {
  return {
    id: row.id,
    exerciseType: row.exercise_type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    totalReps: row.total_reps,
    validReps: row.valid_reps,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    sets
  };
}

export async function createWorkoutSession(
  input: CreateWorkoutSessionInput
): Promise<CloudWorkoutSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: input.userId,
      exercise_type: input.exerciseType,
      started_at: input.startedAt,
      status: "active",
      total_reps: 0,
      valid_reps: 0
    })
    .select(
      "id, exercise_type, started_at, ended_at, status, total_reps, valid_reps, duration_seconds"
    )
    .single<SessionRow>();

  if (error) throw error;

  return toCloudSession(data, []);
}

export async function saveWorkoutSet(
  input: SaveWorkoutSetInput
): Promise<{ setId: string }> {
  const supabase = getSupabaseClient();
  const { data: setRow, error: setError } = await supabase
    .from("workout_sets")
    .upsert({
      session_id: input.sessionId,
      set_number: input.setNumber,
      action: input.action,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      duration_seconds: input.durationSeconds,
      total_reps: input.totalReps,
      valid_reps: input.validReps
    }, {
      onConflict: "session_id,set_number"
    })
    .select("id")
    .single<{ id: string }>();

  if (setError) throw setError;

  if (input.repEvents.length > 0) {
    const { error: repError } = await supabase
      .from("rep_events")
      .upsert(
        input.repEvents.map((rep) => ({
          set_id: setRow.id,
          rep_index: rep.repIndex,
          is_valid: rep.isValid,
          timestamp_seconds: rep.timestampSeconds,
          confidence: rep.confidence,
          feedback: rep.feedback,
          metrics_json: rep.metrics
        })),
        {
          onConflict: "set_id,rep_index"
        }
      );

    if (repError) throw repError;
  }

  const { error: sessionError } = await supabase
    .from("workout_sessions")
    .update({
      total_reps: input.sessionTotalReps,
      valid_reps: input.sessionValidReps,
      duration_seconds: input.sessionDurationSeconds
    })
    .eq("id", input.sessionId);

  if (sessionError) throw sessionError;

  return { setId: setRow.id };
}

export async function finishWorkoutSession(
  input: FinishWorkoutSessionInput
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      ended_at: input.endedAt,
      status: "finished",
      total_reps: input.totalReps,
      valid_reps: input.validReps,
      duration_seconds: input.durationSeconds
    })
    .eq("id", input.sessionId);

  if (error) throw error;
}

export async function listWorkoutHistory(): Promise<CloudWorkoutSession[]> {
  const supabase = getSupabaseClient();
  const { data: sessionRows, error: sessionError } = await supabase
    .from("workout_sessions")
    .select(
      "id, exercise_type, started_at, ended_at, status, total_reps, valid_reps, duration_seconds"
    )
    .order("started_at", { ascending: false })
    .limit(25)
    .returns<SessionRow[]>();

  if (sessionError) throw sessionError;
  if (!sessionRows.length) return [];

  const sessionIds = sessionRows.map((row) => row.id);

  const { data: setRows, error: setError } = await supabase
    .from("workout_sets")
    .select(
      "id, session_id, set_number, action, started_at, ended_at, duration_seconds, total_reps, valid_reps"
    )
    .in("session_id", sessionIds)
    .order("set_number", { ascending: true })
    .returns<SetRow[]>();

  if (setError) throw setError;

  const setIds = setRows.map((row) => row.id);
  const repRows = setIds.length
    ? await supabase
        .from("rep_events")
        .select(
          "id, set_id, rep_index, is_valid, timestamp_seconds, confidence, feedback, metrics_json"
        )
        .in("set_id", setIds)
        .order("rep_index", { ascending: true })
        .returns<RepRow[]>()
    : { data: [] as RepRow[], error: null };

  if (repRows.error) throw repRows.error;

  const repsBySet = new Map<string, CloudRepEvent[]>();
  for (const rep of repRows.data) {
    const reps = repsBySet.get(rep.set_id) ?? [];
    reps.push(toCloudRep(rep));
    repsBySet.set(rep.set_id, reps);
  }

  const setsBySession = new Map<string, CloudWorkoutSet[]>();
  for (const set of setRows) {
    const sets = setsBySession.get(set.session_id) ?? [];
    sets.push(toCloudSet(set, repsBySet.get(set.id) ?? []));
    setsBySession.set(set.session_id, sets);
  }

  return sessionRows.map((session) =>
    toCloudSession(session, setsBySession.get(session.id) ?? [])
  );
}
