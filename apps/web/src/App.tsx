import { LocalPoseCoach } from "./components/LocalPoseCoach";

export default function App() {
  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Local-first mode</p>
          <h1>Fitness AI Local Pose Coach</h1>
          <p>
            Camera frames stay on-device. The browser performs pose inference,
            overlay drawing, rep counting, and temporary set tracking locally.
          </p>
        </div>
        <div className="status-pill">Browser-memory session. Refresh clears data.</div>
      </header>

      <LocalPoseCoach />
    </main>
  );
}
