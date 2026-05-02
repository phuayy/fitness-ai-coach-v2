import { useEffect, useState } from "react";
import {
  getUserAnimationPreferences,
  upsertUserAnimationPreferences
} from "../services/animationPreferences";

interface Props {
  userId: string;
  animationsEnabled: boolean;
  onAnimationsEnabledChange: (enabled: boolean) => void;
  onBackToDashboard: () => void;
}

export function SettingsPage({
  userId,
  animationsEnabled,
  onAnimationsEnabledChange,
  onBackToDashboard
}: Props) {
  const [enabled, setEnabled] = useState(animationsEnabled);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");

    getUserAnimationPreferences(userId)
      .then((preferences) => {
        if (cancelled) return;
        setEnabled(preferences.animationsEnabled);
        onAnimationsEnabledChange(preferences.animationsEnabled);
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load animation settings."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onAnimationsEnabledChange, userId]);

  async function updateAnimationsEnabled(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    onAnimationsEnabledChange(nextEnabled);
    setLoading(true);
    setMessage("");

    try {
      const saved = await upsertUserAnimationPreferences(userId, {
        animationsEnabled: nextEnabled
      });
      setEnabled(saved.animationsEnabled);
      onAnimationsEnabledChange(saved.animationsEnabled);
      setMessage("Settings saved.");
    } catch (error) {
      setEnabled(!nextEnabled);
      onAnimationsEnabledChange(!nextEnabled);
      setMessage(
        error instanceof Error ? error.message : "Could not save settings."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="settings-grid">
      <section className="panel settings-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2>Settings</h2>
          </div>
          <button className="secondary small-button" onClick={onBackToDashboard}>
            Dashboard
          </button>
        </div>

        <label className="settings-toggle">
          <span>
            <strong>Animations enabled</strong>
            <small>
              Allows full-screen timed media effects for reminders and future
              goals.
            </small>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading}
            onChange={(event) => updateAnimationsEnabled(event.target.checked)}
          />
        </label>

        {message && <p className="message">{message}</p>}
      </section>
    </section>
  );
}
