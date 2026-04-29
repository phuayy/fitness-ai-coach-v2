import { useState } from "react";
import { apiClient } from "../services/apiClient";
import type { User } from "../types";

interface Props {
  token: string | null;
  user: User | null;
  onAuth: (token: string, user: User | null) => void;
  onLogout: () => void;
}

export function AuthPanel({ token, user, onAuth, onLogout }: Props) {
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("demo-password-123");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function register() {
    setLoading(true);
    setMessage("");
    try {
      const created = await apiClient.register(email, password);
      setMessage(`Created account for ${created.email}. You can now log in.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);
    setMessage("");
    try {
      const auth = await apiClient.login(email, password);
      localStorage.setItem("fitness_token", auth.access_token);
      const profile = await apiClient.me(auth.access_token);
      onAuth(auth.access_token, profile);
      setMessage(`Logged in as ${profile.email}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (token && user) {
    return (
      <section className="panel compact-panel">
        <div>
          <p className="eyebrow">Account</p>
          <strong>{user.email}</strong>
        </div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">Account</p>
      <h2>Save your workout history</h2>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <label>
        Password
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
      </label>
      <div className="button-row">
        <button onClick={login} disabled={loading}>Log in</button>
        <button className="secondary" onClick={register} disabled={loading}>Register</button>
      </div>
      {message && <p className="message">{message}</p>}
      <p className="hint">The pose coach works without login. Login is only needed to save reps and history.</p>
    </section>
  );
}
