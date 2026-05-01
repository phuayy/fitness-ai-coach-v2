import { useEffect, useMemo, useState } from "react";
import { listWorkoutHistory } from "../services/workoutHistory";
import type { CloudWorkoutSession, CloudWorkoutSet } from "../types";

interface Props {
  enabled: boolean;
  refreshKey: number;
}

function exerciseLabel(value: string): string {
  return value === "pushup" ? "Push-up" : "Squat";
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "--";

  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);

  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
}

export function SessionHistory({ enabled, refreshKey }: Props) {
  const [sessions, setSessions] = useState<CloudWorkoutSession[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const allSets = useMemo(() => {
    return sessions.flatMap((session) =>
      session.sets.map((set) => ({ ...set, session }))
    );
  }, [sessions]);

  const selectedSet = useMemo(() => {
    if (!selectedSetId) return null;
    return allSets.find((set) => set.id === selectedSetId) ?? null;
  }, [allSets, selectedSetId]);

  useEffect(() => {
    if (!enabled) {
      setSessions([]);
      setMessage("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessage("");

    listWorkoutHistory()
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Could not load sessions");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  if (!enabled) {
    return null;
  }

  function openSet(set: CloudWorkoutSet) {
    setSelectedSetId(set.id);
  }

  return (
    <>
      <section className="panel">
        <p className="eyebrow">History</p>
        <h2>Saved sessions</h2>
        {loading && <p className="hint">Loading saved workouts...</p>}
        {message && <p className="message">{message}</p>}
        {!loading && !sessions.length && (
          <p className="hint">No saved sessions yet.</p>
        )}

        <div className="history-list">
          {sessions.map((session) => (
            <article key={session.id} className="history-card session-history-card">
              <div>
                <strong>{exerciseLabel(session.exerciseType)}</strong>
                <span>{new Date(session.startedAt).toLocaleString()}</span>
              </div>
              <span>
                {session.validReps}/{session.totalReps} valid
              </span>
              <span>{formatSeconds(session.durationSeconds)}</span>

              <div className="history-set-list">
                {session.sets.map((set) => (
                  <button
                    key={set.id}
                    className="secondary small-button"
                    onClick={() => openSet(set)}
                  >
                    Set {set.setNumber}: {set.validReps}/{set.totalReps}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedSet && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="set-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-set-title"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Saved set</p>
                <h2 id="history-set-title">Rep Timeline</h2>
              </div>
              <button
                className="secondary small-button"
                onClick={() => setSelectedSetId(null)}
              >
                Close
              </button>
            </header>

            <label>
              Set
              <select
                value={selectedSet.id}
                onChange={(event) => setSelectedSetId(event.target.value)}
              >
                {allSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {new Date(set.session.startedAt).toLocaleDateString()} - Set{" "}
                    {set.setNumber} - {exerciseLabel(set.action)}
                  </option>
                ))}
              </select>
            </label>

            <div className="review-grid">
              <div className="review-video-panel">
                <div className="review-video-placeholder">
                  <strong>Video was not saved</strong>
                  <p>
                    To keep storage lightweight, only session, set, rep, and
                    timestamp metadata are synced to your account.
                  </p>
                </div>
              </div>

              <div className="rep-review-panel">
                <div className="review-summary">
                  <span>Duration: {formatSeconds(selectedSet.durationSeconds)}</span>
                  <strong>
                    {selectedSet.validReps}/{selectedSet.totalReps} valid
                  </strong>
                </div>

                {selectedSet.reps.length === 0 ? (
                  <p className="hint">No rep events were saved for this set.</p>
                ) : (
                  <div className="table-scroll compact-scroll">
                    <table className="set-table rep-review-table">
                      <thead>
                        <tr>
                          <th>Rep</th>
                          <th>Status</th>
                          <th>Timestamp</th>
                          <th>Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSet.reps.map((rep) => (
                          <tr key={rep.id}>
                            <td>{rep.repIndex}</td>
                            <td>
                              <span
                                className={`rep-status ${
                                  rep.isValid ? "valid" : "invalid"
                                }`}
                              >
                                {rep.isValid ? "Valid" : "Invalid"}
                              </span>
                            </td>
                            <td>{formatSeconds(rep.timestampSeconds)}</td>
                            <td>{rep.feedback}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
