import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { LocalPoseCoach } from "./components/LocalPoseCoach";
import { SessionHistory } from "./components/SessionHistory";
import {
  clearSupabaseAuthStorage,
  isSupabaseConfigured,
  supabase
} from "./lib/supabaseClient";
import type { SupabaseSession } from "./lib/supabaseClient";

export default function App() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [routePath, setRoutePath] = useState(window.location.pathname);
  const [recoveryMode, setRecoveryMode] = useState(routePath === "/reset-password");
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [loggingOut, setLoggingOut] = useState(false);
  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured ? "Restoring account..." : "Supabase not configured"
  );
  const [historyRefresh, setHistoryRefresh] = useState(0);

  function navigate(path: string) {
    window.history.pushState(null, "", path);
    setRoutePath(window.location.pathname);
  }

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

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Cloud history mode</p>
          <h1>Fitness AI Local Pose Coach</h1>
          <p>
            Camera frames stay on-device. Rep, set, and session metadata syncs
            to your account so workout history survives refreshes.
          </p>
        </div>
        <div className="hero-actions">
          <div className="status-pill">
            <span>{authStatus}</span>
            <strong>{session.user.email ?? "Google account"}</strong>
          </div>
          <button className="secondary" onClick={logout} disabled={loggingOut}>
            Log out
          </button>
        </div>
      </header>

      <LocalPoseCoach
        userId={session?.user.id ?? null}
        onHistoryChanged={() => setHistoryRefresh((value) => value + 1)}
      />

      <div className="lower-grid history-only">
        <SessionHistory enabled={Boolean(session)} refreshKey={historyRefresh} />
      </div>
    </main>
  );
}
