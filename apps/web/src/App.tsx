import { useCallback, useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { Dashboard } from "./components/Dashboard";
import { LocalPoseCoach } from "./components/LocalPoseCoach";
import { SessionHistory } from "./components/SessionHistory";
import {
  clearSupabaseAuthStorage,
  isSupabaseConfigured,
  supabase
} from "./lib/supabaseClient";
import type { SupabaseSession } from "./lib/supabaseClient";
import type { WorkoutHelpStatus } from "./types";

const DEFAULT_WORKOUT_HELP_STATUS: WorkoutHelpStatus = {
  camera: "Device in use",
  model: "Not ready",
  humanGate: "Device in use",
  mode: "local only",
  cloud: "Cloud history ready.",
  session: "Click Start session to save workout history."
};

export default function App() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [routePath, setRoutePath] = useState(window.location.pathname);
  const [recoveryMode, setRecoveryMode] = useState(routePath === "/reset-password");
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [loggingOut, setLoggingOut] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [workoutHelpStatus, setWorkoutHelpStatus] =
    useState<WorkoutHelpStatus>(DEFAULT_WORKOUT_HELP_STATUS);
  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured ? "Restoring account..." : "Supabase not configured"
  );
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function navigate(path: string) {
    window.history.pushState(null, "", path);
    setRoutePath(window.location.pathname);
  }

  const updateWorkoutHelpStatus = useCallback((status: WorkoutHelpStatus) => {
    setWorkoutHelpStatus((current) =>
      current.camera === status.camera &&
      current.model === status.model &&
      current.humanGate === status.humanGate &&
      current.mode === status.mode &&
      current.cloud === status.cloud &&
      current.session === status.session
        ? current
        : status
    );
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthStatus(data.session ? "Cloud history connected" : "Login required");
      setAuthReady(true);
      if (data.session && window.location.pathname === "/login") {
        navigate("/");
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthStatus(nextSession ? "Cloud history connected" : "Login required");
      setAuthReady(true);

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }

      if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
      }

      if (nextSession && window.location.pathname === "/login") {
        navigate("/");
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    function syncRoute() {
      setRoutePath(window.location.pathname);
    }

    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (routePath === "/reset-password") {
      setRecoveryMode(true);
    }
  }, [routePath]);

  useEffect(() => {
    if (
      authReady &&
      !session &&
      routePath !== "/login" &&
      routePath !== "/reset-password"
    ) {
      window.history.replaceState(null, "", "/login");
      setRoutePath("/login");
    }
  }, [authReady, routePath, session]);

  function finishLoginFlow() {
    if (window.location.pathname !== "/") {
      navigate("/");
    }
  }

  function finishRecoveryMode() {
    setRecoveryMode(false);
    if (window.location.pathname === "/reset-password") {
      window.history.replaceState(null, "", "/");
      setRoutePath("/");
    }
  }

  async function logout() {
    if (!supabase) return;

    setLoggingOut(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } finally {
      clearSupabaseAuthStorage();
      setSession(null);
      setAuthStatus("Login required");
      setLoggingOut(false);
      navigate("/login");
    }
  }

  if (!authReady) {
    return (
      <main className="auth-page">
        <section className="panel auth-card">
          <p className="eyebrow">Account</p>
          <h1>Restoring your session</h1>
          <p className="hint">Checking whether this device is already signed in.</p>
        </section>
      </main>
    );
  }

  if (!session || recoveryMode || routePath === "/login") {
    return (
      <main className="auth-page">
        <header className="auth-hero">
          <p className="eyebrow">Fitness AI Local Pose Coach</p>
          <h1>Sign in to sync your workout history.</h1>
          <p>
            Camera frames stay on-device. Your account stores session, set, and
            rep metadata so progress is available after refresh.
          </p>
        </header>
        <AuthPanel
          recoveryMode={recoveryMode}
          onAuthenticated={finishLoginFlow}
          onRecoveryComplete={finishRecoveryMode}
        />
      </main>
    );
  }

  const isWorkoutRoute = routePath === "/workout";

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">
            {isWorkoutRoute ? "Workout session" : "Dashboard"}
          </p>
          <h1>{isWorkoutRoute ? "Local Pose Coach" : "Fitness AI Dashboard"}</h1>
          {!isWorkoutRoute && (
            <p>
              Start a workout, review your training calendar, and keep progress
              tied to your account.
            </p>
          )}
        </div>
        <div className="hero-actions">
          <div className="status-pill">
            <span>{authStatus}</span>
            <strong>{session.user.email ?? "Google account"}</strong>
          </div>
          {isWorkoutRoute && (
            <>
              <button className="secondary" onClick={() => navigate("/")}>
                Dashboard
              </button>
              <button className="secondary" onClick={() => setHelpOpen(true)}>
                Help
              </button>
            </>
          )}
          <button className="secondary" onClick={logout} disabled={loggingOut}>
            Log out
          </button>
        </div>
      </header>

      {isWorkoutRoute ? (
        <>
          <LocalPoseCoach
            userId={session?.user.id ?? null}
            onHistoryChanged={() => setHistoryRefresh((value) => value + 1)}
            onStatusChange={updateWorkoutHelpStatus}
          />

          <div className="lower-grid history-only">
            <SessionHistory enabled={Boolean(session)} refreshKey={historyRefresh} />
          </div>
        </>
      ) : (
        <Dashboard
          refreshKey={historyRefresh}
          onStartWorkout={() => navigate("/workout")}
        />
      )}

      {isWorkoutRoute && helpOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="set-review-modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workout-help-title"
          >
            <header className="modal-header">
              <div>
                <p className="eyebrow">Workout status</p>
                <h2 id="workout-help-title">Help</h2>
              </div>
              <button
                className="secondary small-button"
                onClick={() => setHelpOpen(false)}
              >
                Close
              </button>
            </header>

            <dl className="status-list help-status-list">
              <div>
                <dt>Camera</dt>
                <dd>{workoutHelpStatus.camera}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{workoutHelpStatus.model}</dd>
              </div>
              <div>
                <dt>Human gate</dt>
                <dd>{workoutHelpStatus.humanGate}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{workoutHelpStatus.mode}</dd>
              </div>
              <div>
                <dt>Cloud</dt>
                <dd>{workoutHelpStatus.cloud}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{workoutHelpStatus.session}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}
