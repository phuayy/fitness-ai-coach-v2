import { useState } from "react";
import {
  getAppOrigin,
  getSupabaseClient,
  isSupabaseConfigured,
  setAuthPersistencePreference,
  shouldRememberAuthSession
} from "../lib/supabaseClient";
import googleSignInLogo from "../../../../visual_elements/logos/google_sign_in_logo_transparent.png";

interface Props {
  recoveryMode: boolean;
  onAuthenticated: () => void;
  onRecoveryComplete: () => void;
}

export function AuthPanel({
  recoveryMode,
  onAuthenticated,
  onRecoveryComplete
}: Props) {
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("demo-password-123");
  const [newPassword, setNewPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(shouldRememberAuthSession);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function runAuthAction(action: () => Promise<void>) {
    if (!isSupabaseConfigured) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  function login() {
    return runAuthAction(async () => {
      setAuthPersistencePreference(rememberMe);

      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      setMessage("Logged in.");
      onAuthenticated();
    });
  }

  function register() {
    return runAuthAction(async () => {
      setAuthPersistencePreference(rememberMe);

      const { error } = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAppOrigin()
        }
      });

      if (error) throw error;
      setMessage("Account created. Check your email if confirmation is enabled.");
    });
  }

  function continueWithGoogle() {
    return runAuthAction(async () => {
      setAuthPersistencePreference(rememberMe);

      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAppOrigin(),
          queryParams: {
            access_type: "offline",
            prompt: "select_account"
          }
        }
      });

      if (error) throw error;
    });
  }

  function sendPasswordReset() {
    return runAuthAction(async () => {
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${getAppOrigin()}/reset-password`
        }
      );

      if (error) throw error;
      setMessage("Password reset email sent. Check your inbox.");
    });
  }

  function updatePassword() {
    return runAuthAction(async () => {
      const { error } = await getSupabaseClient().auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      setNewPassword("");
      setMessage("Password updated. You can continue using your account.");
      onRecoveryComplete();
    });
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="panel">
        <p className="eyebrow">Account</p>
        <h2>Supabase setup required</h2>
        <p className="hint">
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable cloud
          workout history.
        </p>
      </section>
    );
  }

  if (recoveryMode) {
    return (
      <section className="panel auth-card">
        <p className="eyebrow">Password reset</p>
        <h2>Choose a new password</h2>
        <label>
          New password
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <div className="button-row">
          <button onClick={updatePassword} disabled={loading || newPassword.length < 8}>
            Update password
          </button>
        </div>
        {message && <p className="message">{message}</p>}
      </section>
    );
  }

  return (
    <section className="panel auth-card">
      <p className="eyebrow">Account</p>
      <h2>Sign in to save history</h2>

      <button
        className="google-login-button"
        onClick={continueWithGoogle}
        disabled={loading}
      >
        <img
          className="google-login-logo"
          src={googleSignInLogo}
          alt=""
          aria-hidden="true"
        />
        Continue with Google
      </button>

      <label>
        Email
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </label>
      <label>
        Password
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
        />
      </label>
      <label className="checkbox-row remember-row">
        <input
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
          type="checkbox"
        />
        Remember Me 🥺
      </label>
      <div className="button-row">
        <button onClick={login} disabled={loading}>
          Log in
        </button>
        <button className="secondary" onClick={register} disabled={loading}>
          Register
        </button>
        <button className="secondary" onClick={sendPasswordReset} disabled={loading}>
          Forgot password
        </button>
      </div>
      {message && <p className="message">{message}</p>}
      <p className="hint">
        Login is required so sessions, sets, and rep timestamps can be restored
        after refresh.
      </p>
    </section>
  );
}
