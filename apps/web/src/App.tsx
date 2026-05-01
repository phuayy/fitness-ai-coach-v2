import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { LocalPoseCoach } from "./components/LocalPoseCoach";
import { SessionHistory } from "./components/SessionHistory";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient";
import type { SupabaseSession } from "./lib/supabaseClient";

export default function App() {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(
    window.location.pathname === "/reset-password"
  );
  const [authStatus, setAuthStatus] = useState(
    isSupabaseConfigured ? "Restoring account..." : "Supabase not configured"
  );
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthStatus(data.session ? "Cloud history connected" : "Login required");
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthStatus(nextSession ? "Cloud history connected" : "Login required");

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }

      if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function finishRecoveryMode() {
    setRecoveryMode(false);
    if (window.location.pathname === "/reset-password") {
      window.history.replaceState(null, "", "/");
    }
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
        <div className="status-pill">{authStatus}</div>
      </header>

      <LocalPoseCoach
        userId={session?.user.id ?? null}
        onHistoryChanged={() => setHistoryRefresh((value) => value + 1)}
      />

      <div className="lower-grid">
        <AuthPanel
          session={session}
          user={session?.user ?? null}
          recoveryMode={recoveryMode}
          onRecoveryComplete={finishRecoveryMode}
        />
        <SessionHistory enabled={Boolean(session)} refreshKey={historyRefresh} />
      </div>
    </main>
  );
}
