import { useEffect, useState } from "react";
import { apiClient } from "../services/apiClient";
import type { WorkoutSession } from "../types";

interface Props {
  token: string | null;
  refreshKey: number;
}

export function SessionHistory({ token, refreshKey }: Props) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiClient.sessions(token)
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not load sessions");
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey]);

  if (!token) return null;

  return (
    <section className="panel">
      <p className="eyebrow">History</p>
      <h2>Recent sessions</h2>
      {message && <p className="message">{message}</p>}
      {!sessions.length && <p className="hint">No saved sessions yet.</p>}
      <div className="history-list">
        {sessions.map((session) => (
          <article key={session.id} className="history-card">
            <strong>{session.exercise_type}</strong>
            <span>{new Date(session.started_at).toLocaleString()}</span>
            <span>{session.valid_reps}/{session.total_reps} valid reps</span>
          </article>
        ))}
      </div>
    </section>
  );
}
