import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { LocalPoseCoach } from "./components/LocalPoseCoach";
import { SessionHistory } from "./components/SessionHistory";
import { apiClient } from "./services/apiClient";
import type { User } from "./types";

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("fitness_token"));
  const [user, setUser] = useState<User | null>(null);
  const [apiStatus, setApiStatus] = useState("Checking backend...");
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    apiClient.health()
      .then((health) => setApiStatus(`Backend online: ${health.environment}`))
      .catch(() => setApiStatus(`Backend unavailable at ${apiClient.baseUrl}. Local coaching still works.`));
  }, []);

  useEffect(() => {
    if (!token) return;
    apiClient.me(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("fitness_token");
        setToken(null);
        setUser(null);
      });
  }, [token]);

  function handleAuth(nextToken: string, nextUser: User | null) {
    setToken(nextToken);
    setUser(nextUser);
  }

  function handleLogout() {
    localStorage.removeItem("fitness_token");
    setToken(null);
    setUser(null);
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Production-ready direction</p>
          <h1>Fitness AI Local Pose Coach</h1>
          <p>
            Camera frames stay on-device. The browser performs pose inference and overlay drawing instantly, while the backend stores accounts, sessions, reps, and advice.
          </p>
        </div>
        <div className="status-pill">{apiStatus}</div>
      </header>

      <LocalPoseCoach token={token} onSessionSaved={() => setHistoryRefresh((value) => value + 1)} />

      <div className="lower-grid">
        <AuthPanel token={token} user={user} onAuth={handleAuth} onLogout={handleLogout} />
        <SessionHistory token={token} refreshKey={historyRefresh} />
      </div>
    </main>
  );
}
