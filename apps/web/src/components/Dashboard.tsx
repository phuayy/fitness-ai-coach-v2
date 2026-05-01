import { useEffect, useMemo, useState } from "react";
import {
  getOldestWorkoutSessionYear,
  listWorkoutHistory
} from "../services/workoutHistory";
import type { CloudWorkoutSession } from "../types";

interface Props {
  refreshKey: number;
  onStartWorkout: () => void;
}

type CalendarDay = {
  date: Date;
  dayNumber: number;
  inCurrentMonth: boolean;
  key: string;
  sessions: CloudWorkoutSession[];
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function buildMonthDays(
  year: number,
  month: number,
  sessionsByDay: Map<string, CloudWorkoutSession[]>
): CalendarDay[] {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = dateKey(date);

    return {
      date,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      key,
      sessions: sessionsByDay.get(key) ?? []
    };
  });
}

export function Dashboard({ refreshKey, onStartWorkout }: Props) {
  const today = useMemo(() => new Date(), []);
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [oldestYear, setOldestYear] = useState(today.getFullYear());
  const [sessions, setSessions] = useState<CloudWorkoutSession[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const sessionsByDay = useMemo(() => {
    const next = new Map<string, CloudWorkoutSession[]>();

    for (const session of sessions) {
      const key = dateKey(new Date(session.startedAt));
      const items = next.get(key) ?? [];
      items.push(session);
      next.set(key, items);
    }

    return next;
  }, [sessions]);

  const calendarDays = useMemo(
    () => buildMonthDays(displayYear, displayMonth, sessionsByDay),
    [displayMonth, displayYear, sessionsByDay]
  );

  const selectedDay = selectedDateKey
    ? calendarDays.find((day) => day.key === selectedDateKey) ?? null
    : null;

  const yearOptions = useMemo(() => {
    const currentYear = today.getFullYear();
    const minYear = Math.min(oldestYear, currentYear, displayYear);
    const maxYear = Math.max(currentYear, displayYear);
    const count = maxYear - minYear + 1;

    return Array.from({ length: count }, (_, index) => maxYear - index);
  }, [displayYear, oldestYear, today]);

  useEffect(() => {
    let cancelled = false;

    getOldestWorkoutSessionYear()
      .then((year) => {
        if (!cancelled && year) setOldestYear(year);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load calendar year range."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const monthStart = new Date(displayYear, displayMonth, 1);
    const nextMonthStart = new Date(displayYear, displayMonth + 1, 1);

    setLoading(true);
    setMessage("");

    listWorkoutHistory({
      startedFrom: monthStart.toISOString(),
      startedTo: nextMonthStart.toISOString(),
      limit: 200
    })
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load calendar sessions."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [displayMonth, displayYear, refreshKey]);

  function rotateMonth(offset: number) {
    const next = new Date(displayYear, displayMonth + offset, 1);
    setDisplayMonth(next.getMonth());
    setDisplayYear(next.getFullYear());
    setSelectedDateKey(null);
  }

  function selectMonth(month: number) {
    setDisplayMonth(month);
    setSelectedDateKey(null);
  }

  function selectYear(rawYear: string) {
    const parsed = Number(rawYear);
    if (!Number.isInteger(parsed)) return;

    setDisplayYear(parsed);
    setSelectedDateKey(null);
  }

  return (
    <>
      <section className="dashboard-grid">
        <button className="dashboard-module workout-module" onClick={onStartWorkout}>
          <span className="eyebrow">Start your workout session</span>
          <strong>Get BIG now</strong>
          <span>Open the local pose coach and start a tracked session.</span>
        </button>

        <section className="panel dashboard-module placeholder-module">
          <span className="eyebrow">To be delivered</span>
          <strong>AI analytics</strong>
          <span>
            Trend reports, form insights, and personalized coaching intelligence
            will arrive here.
          </span>
        </section>

        <section className="panel calendar-module">
          <div className="calendar-content">
            <div className="calendar-header">
              <div>
                <p className="eyebrow">Training calendar</p>
                <h2>
                  {MONTH_LABELS[displayMonth]} {displayYear}
                </h2>
              </div>

              <div className="calendar-filters">
                <label>
                  Month
                  <select
                    value={displayMonth}
                    onChange={(event) => selectMonth(Number(event.target.value))}
                  >
                    {MONTH_LABELS.map((label, index) => (
                      <option key={label} value={index}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Year
                  <input
                    type="number"
                    list="dashboard-year-options"
                    value={displayYear}
                    onChange={(event) => selectYear(event.target.value)}
                  />
                  <datalist id="dashboard-year-options">
                    {yearOptions.map((year) => (
                      <option key={year} value={year} />
                    ))}
                  </datalist>
                </label>
              </div>
            </div>

            {message && <p className="message">{message}</p>}
            {loading && <p className="hint">Loading workout days...</p>}

            <div className="calendar-weekdays">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarDays.map((day) => (
                <button
                  key={day.key}
                  className={[
                    "calendar-day",
                    day.inCurrentMonth ? "" : "outside-month",
                    day.sessions.length ? "has-session" : "",
                    day.key === dateKey(today) ? "today" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedDateKey(day.key)}
                  disabled={!day.inCurrentMonth}
                >
                  <span>{day.dayNumber}</span>
                  {day.sessions.length > 0 && (
                    <strong>{day.sessions.length}</strong>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="calendar-rail" aria-label="Calendar navigation">
            <button
              className="secondary small-button"
              onClick={() => rotateMonth(-1)}
              aria-label="Previous month"
            >
              ^
            </button>
            <button
              className="secondary small-button"
              onClick={() => rotateMonth(1)}
              aria-label="Next month"
            >
              v
            </button>
          </div>
        </section>
      </section>

      {selectedDay && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="set-review-modal calendar-day-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-day-title"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Workout history</p>
                <h2 id="calendar-day-title">
                  {selectedDay.date.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric"
                  })}
                </h2>
              </div>
              <button
                className="secondary small-button"
                onClick={() => setSelectedDateKey(null)}
              >
                Close
              </button>
            </header>

            {selectedDay.sessions.length === 0 ? (
              <p className="hint">No saved sessions on this day.</p>
            ) : (
              <div className="calendar-session-list">
                {selectedDay.sessions.map((session) => (
                  <article key={session.id} className="history-card calendar-session-card">
                    <div>
                      <strong>{exerciseLabel(session.exerciseType)}</strong>
                      <span>{new Date(session.startedAt).toLocaleTimeString()}</span>
                      <span className="status-badge local">{session.status}</span>
                    </div>
                    <span>
                      {session.validReps}/{session.totalReps} valid
                    </span>
                    <span>{formatSeconds(session.durationSeconds)}</span>

                    <div className="history-set-list">
                      {session.sets.length === 0 ? (
                        <span className="hint">No sets saved for this session.</span>
                      ) : (
                        session.sets.map((set) => (
                          <div key={set.id} className="calendar-set-row">
                            <strong>Set {set.setNumber}</strong>
                            <span>{exerciseLabel(set.action)}</span>
                            <span>
                              {set.validReps}/{set.totalReps} valid
                            </span>
                            <span>{formatSeconds(set.durationSeconds)}</span>
                            <span>{set.reps.length} rep event(s)</span>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
