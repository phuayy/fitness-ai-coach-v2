import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import { drawPose } from "../lib/drawPose";
import { createCounterState, updateCounter } from "../lib/repCounter";
import { apiClient } from "../services/apiClient";
import type { CoachFrameState, ExerciseType } from "../types";

interface Props {
  token: string | null;
  onSessionSaved: () => void;
}

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

export function LocalPoseCoach({ token, onSessionSaved }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const counterRef = useRef(createCounterState());
  const activeSessionIdRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const pendingRepSaveRef = useRef(false);
  const lastVideoTimeRef = useRef(-1);
  const framesRef = useRef({ count: 0, lastTs: performance.now(), fps: 0, lastUiTs: 0 });

  const [exercise, setExercise] = useState<ExerciseType>("squat");
  const [cameraStatus, setCameraStatus] = useState("Camera not started");
  const [modelStatus, setModelStatus] = useState("Model loading...");
  const [sessionStatus, setSessionStatus] = useState("Local-only mode until you start a saved session.");
  const [coachState, setCoachState] = useState<CoachFrameState>({
    reps: 0,
    validReps: 0,
    stage: "idle",
    feedback: "Stand in frame to begin.",
    confidence: 0,
    fps: 0,
    backendStatus: "idle"
  });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: "user"
          },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setCameraStatus("Camera running locally");

        landmarkerRef.current = await createLandmarker();
        setModelStatus("Pose model ready");
        runLoop();
      } catch (error) {
        setCameraStatus(error instanceof Error ? error.message : "Camera/model startup failed");
        setModelStatus("Not ready");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    counterRef.current = createCounterState();
    setCoachState((prev) => ({ ...prev, reps: 0, validReps: 0, stage: "idle", feedback: "Stand in frame to begin." }));
  }, [exercise]);

  async function createLandmarker(): Promise<PoseLandmarker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    } catch {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    }
  }

  function runLoop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker) {
      animationRef.current = requestAnimationFrame(runLoop);
      return;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const result: PoseLandmarkerResult = landmarker.detectForVideo(video, performance.now());
      const ctx = canvas.getContext("2d");
      const landmarks = result.landmarks[0] ?? [];
      if (ctx) drawPose(ctx, landmarks, width, height);

      if (landmarks.length) {
        const previousReps = counterRef.current.reps;
        counterRef.current = updateCounter(exercise, landmarks, counterRef.current);
        if (counterRef.current.reps > previousReps && counterRef.current.lastPayload) {
          void saveRep(counterRef.current.lastPayload);
        }
      }
    }

    const now = performance.now();
    framesRef.current.count += 1;
    if (now - framesRef.current.lastTs >= 1000) {
      framesRef.current.fps = framesRef.current.count;
      framesRef.current.count = 0;
      framesRef.current.lastTs = now;
    }

    if (now - framesRef.current.lastUiTs > 180) {
      framesRef.current.lastUiTs = now;
      const counter = counterRef.current;
      setCoachState({
        reps: counter.reps,
        validReps: counter.validReps,
        stage: counter.stage,
        feedback: counter.lastFeedback,
        confidence: counter.lastConfidence,
        fps: framesRef.current.fps,
        backendStatus: pendingRepSaveRef.current ? "saving" : activeSessionIdRef.current ? "saved session active" : "local only"
      });
    }

    animationRef.current = requestAnimationFrame(runLoop);
  }

  async function startSavedSession() {
    counterRef.current = createCounterState();
    sessionStartedAtRef.current = performance.now();
    setSessionStatus("Starting saved session...");

    if (!token) {
      activeSessionIdRef.current = null;
      setSessionStatus("Local session started. Log in to save history.");
      return;
    }

    try {
      const session = await apiClient.startSession(exercise, token);
      activeSessionIdRef.current = session.id;
      setSessionStatus(`Saved ${exercise} session #${session.id} started.`);
    } catch (error) {
      activeSessionIdRef.current = null;
      setSessionStatus(error instanceof Error ? error.message : "Could not start saved session");
    }
  }

  async function saveRep(payload: NonNullable<ReturnType<typeof updateCounter>["lastPayload"]>) {
    if (!token || !activeSessionIdRef.current) return;
    pendingRepSaveRef.current = true;
    try {
      await apiClient.recordRep(activeSessionIdRef.current, payload, token);
    } catch (error) {
      setSessionStatus(error instanceof Error ? `Rep save failed: ${error.message}` : "Rep save failed");
    } finally {
      pendingRepSaveRef.current = false;
    }
  }

  async function finishSavedSession() {
    const durationSeconds = sessionStartedAtRef.current ? Math.round((performance.now() - sessionStartedAtRef.current) / 1000) : 0;
    const counter = counterRef.current;

    if (!token || !activeSessionIdRef.current) {
      setSessionStatus(`Local session finished: ${counter.validReps}/${counter.reps} valid reps.`);
      return;
    }

    try {
      await apiClient.finishSession(activeSessionIdRef.current, counter.reps, counter.validReps, durationSeconds, token);
      setSessionStatus(`Saved session finished: ${counter.validReps}/${counter.reps} valid reps.`);
      activeSessionIdRef.current = null;
      onSessionSaved();
    } catch (error) {
      setSessionStatus(error instanceof Error ? error.message : "Could not finish session");
    }
  }

  return (
    <section className="coach-grid">
      <div className="video-card">
        <div className="video-shell">
          <video ref={videoRef} playsInline muted className="camera-video" />
          <canvas ref={canvasRef} className="pose-canvas" />
        </div>
      </div>

      <aside className="panel coach-panel">
        <p className="eyebrow">Live local coach</p>
        <h2>Instant overlay, no WebRTC relay</h2>

        <label>
          Exercise
          <select value={exercise} onChange={(event) => setExercise(event.target.value as ExerciseType)}>
            <option value="squat">Squat</option>
            <option value="pushup">Push-up</option>
          </select>
        </label>

        <div className="metric-grid">
          <div><span>Reps</span><strong>{coachState.reps}</strong></div>
          <div><span>Valid</span><strong>{coachState.validReps}</strong></div>
          <div><span>FPS</span><strong>{coachState.fps}</strong></div>
          <div><span>Confidence</span><strong>{Math.round(coachState.confidence * 100)}%</strong></div>
        </div>

        <div className="feedback-box">
          <span>{coachState.stage.toUpperCase()}</span>
          <strong>{coachState.feedback}</strong>
        </div>

        <div className="button-row">
          <button onClick={startSavedSession}>Start session</button>
          <button className="secondary" onClick={finishSavedSession}>Finish</button>
        </div>

        <dl className="status-list">
          <div><dt>Camera</dt><dd>{cameraStatus}</dd></div>
          <div><dt>Model</dt><dd>{modelStatus}</dd></div>
          <div><dt>Backend</dt><dd>{coachState.backendStatus}</dd></div>
          <div><dt>Session</dt><dd>{sessionStatus}</dd></div>
        </dl>
      </aside>
    </section>
  );
}
