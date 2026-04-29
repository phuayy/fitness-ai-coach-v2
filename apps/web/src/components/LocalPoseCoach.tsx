import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { useEffect, useMemo, useRef, useState } from "react";
import { drawPose } from "../lib/drawPose";
import { createCounterState, updateCounter } from "../lib/repCounter";
import type { CoachFrameState, ExerciseType, SetRecord } from "../types";
import { getExercisePoseQuality } from "../lib/poseQuality";

interface Props {
  token?: string | null;
  onSessionSaved?: () => void;
}

const MODEL_URL =
  import.meta.env.VITE_POSE_MODEL_URL || "/models/pose_landmarker_full.task";

const WASM_URL =
  import.meta.env.VITE_MEDIAPIPE_WASM_URL ||
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

function exerciseLabel(value: ExerciseType): string {
  return value === "pushup" ? "Push-up" : "Squat";
}

export function LocalPoseCoach(_props: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const counterRef = useRef(createCounterState());
  const lastVideoTimeRef = useRef(-1);
  const framesRef = useRef({ count: 0, lastTs: performance.now(), fps: 0, lastUiTs: 0 });

  const exerciseRef = useRef<ExerciseType>("squat");
  const sessionActiveRef = useRef(false);
  const setActiveRef = useRef(false);
  const setRowsRef = useRef<SetRecord[]>([]);
  const nextSetNumberRef = useRef(1);
  const voiceEnabledRef = useRef(true);

  const [exercise, setExercise] = useState<ExerciseType>("squat");
  const [cameraStatus, setCameraStatus] = useState("Camera not started");
  const [modelStatus, setModelStatus] = useState("Model loading...");
  const [sessionStatus, setSessionStatus] = useState("Click Start session to begin temporary local set tracking.");
  const [sessionActive, setSessionActive] = useState(false);
  const [setActive, setSetActive] = useState(false);
  const [setRows, setSetRows] = useState<SetRecord[]>([]);
  const [nextSetNumber, setNextSetNumber] = useState(1);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const [coachState, setCoachState] = useState<CoachFrameState>({
    reps: 0,
    validReps: 0,
    stage: "idle",
    feedback: "Start a set to begin counting.",
    confidence: 0,
    fps: 0,
    backendStatus: "local only"
  });

  const tableTotals = useMemo(() => {
    return setRows.reduce(
      (total, row) => ({
        validActions: total.validActions + row.validActions,
        totalReps: total.totalReps + row.totalReps
      }),
      { validActions: 0, totalReps: 0 }
    );
  }, [setRows]);

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

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    exerciseRef.current = exercise;

    if (!setActiveRef.current) {
      resetLiveCounter(`Ready for ${exerciseLabel(exercise)}. Click Start Set to count.`);
    }
  }, [exercise]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  async function createLandmarker(): Promise<PoseLandmarker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.6
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

  function speakValidCount(count: number) {
    if (!voiceEnabledRef.current) return;
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(String(count));
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  }

  function resetLiveCounter(feedback: string) {
    const nextCounter = createCounterState();
    nextCounter.lastFeedback = feedback;
    counterRef.current = nextCounter;

    setCoachState((prev) => ({
      ...prev,
      reps: 0,
      validReps: 0,
      stage: "idle",
      feedback,
      confidence: 0
    }));
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
      const quality = getExercisePoseQuality(exercise, landmarks);

      if (ctx) {
        if (quality.ok) {
          drawPose(ctx, landmarks, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }
      }

      if (quality.ok && setActiveRef.current) {
        const previousValidReps = counterRef.current.validReps;

        counterRef.current = updateCounter(
          exerciseRef.current,
          landmarks,
          counterRef.current
        );

        if (counterRef.current.validReps > previousValidReps) {
          speakValidCount(counterRef.current.validReps);
        }
      } else if (!quality.ok) {
        counterRef.current = {
          ...counterRef.current,
          lastFeedback: quality.feedback,
          lastConfidence: quality.confidence,
          lastPayload: undefined
        };
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
        backendStatus: setActiveRef.current
          ? `set ${nextSetNumberRef.current} active`
          : sessionActiveRef.current
            ? "session active"
            : "local only"
      });
    }

    animationRef.current = requestAnimationFrame(runLoop);
  }

  function startLocalSession() {
    setRowsRef.current = [];
    setSetRows([]);

    nextSetNumberRef.current = 1;
    setNextSetNumber(1);

    sessionActiveRef.current = true;
    setSessionActive(true);

    setActiveRef.current = false;
    setSetActive(false);

    resetLiveCounter("Session started. Click Start Set for set 1.");
    setSessionStatus("Temporary local session started. Data will reset on browser refresh.");
  }

  function startSet() {
    if (!sessionActiveRef.current) {
      setSessionStatus("Click Start session before starting a set.");
      return;
    }

    if (setActiveRef.current) return;

    counterRef.current = createCounterState();

    setActiveRef.current = true;
    setSetActive(true);

    setCoachState((prev) => ({
      ...prev,
      reps: 0,
      validReps: 0,
      stage: "idle",
      feedback: `Set ${nextSetNumberRef.current} started. Begin ${exerciseLabel(exerciseRef.current)}.`
    }));

    setSessionStatus(`Set ${nextSetNumberRef.current} active. Valid actions will be announced.`);
  }

  function stopSet(reason: "manual" | "auto" = "manual"): SetRecord | null {
    if (!setActiveRef.current) return null;

    const counter = counterRef.current;

    const row: SetRecord = {
      id: `${Date.now()}-${nextSetNumberRef.current}`,
      action: exerciseRef.current,
      setNumber: nextSetNumberRef.current,
      validActions: counter.validReps,
      totalReps: counter.reps,
      completedAt: new Date().toLocaleTimeString()
    };

    const nextRows = [...setRowsRef.current, row];

    setRowsRef.current = nextRows;
    setSetRows(nextRows);

    nextSetNumberRef.current += 1;
    setNextSetNumber(nextSetNumberRef.current);

    setActiveRef.current = false;
    setSetActive(false);

    resetLiveCounter(`Set ${row.setNumber} saved. Click Start Set for set ${nextSetNumberRef.current}.`);

    setSessionStatus(
      reason === "auto"
        ? `Set ${row.setNumber} auto-saved during Finish Session: ${row.validActions}/${row.totalReps} valid.`
        : `Set ${row.setNumber} saved: ${row.validActions}/${row.totalReps} valid.`
    );

    return row;
  }

  function toggleSet() {
    if (setActiveRef.current) {
      stopSet("manual");
    } else {
      startSet();
    }
  }

  function finishLocalSession() {
    if (!sessionActiveRef.current) {
      setSessionStatus("No active session to finish.");
      return;
    }

    if (setActiveRef.current) {
      stopSet("auto");
    }

    const rows = setRowsRef.current;

    const totals = rows.reduce(
      (total, row) => ({
        validActions: total.validActions + row.validActions,
        totalReps: total.totalReps + row.totalReps
      }),
      { validActions: 0, totalReps: 0 }
    );

    sessionActiveRef.current = false;
    setSessionActive(false);

    setActiveRef.current = false;
    setSetActive(false);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    resetLiveCounter("Session finalized. Review or delete rows in the table below.");

    setSessionStatus(
      rows.length
        ? `Session finalized: ${totals.validActions}/${totals.totalReps} valid actions across ${rows.length} set(s).`
        : "Session finalized with no sets recorded."
    );
  }

  function deleteSet(id: string) {
    const nextRows = setRowsRef.current.filter((row) => row.id !== id);

    setRowsRef.current = nextRows;
    setSetRows(nextRows);

    setSessionStatus("Set row deleted from temporary session table.");
  }

  return (
    <>
      <section className="coach-grid">
        <div className="video-card">
          <div className="video-shell">
            <video ref={videoRef} playsInline muted className="camera-video" />
            <canvas ref={canvasRef} className="pose-canvas" />
          </div>
        </div>

        <aside className="panel coach-panel">
          <p className="eyebrow">Live local coach</p>
          <h2>Instant overlay, local set tracking</h2>

          <label>
            Exercise
            <select
              value={exercise}
              disabled={setActive}
              onChange={(event) => setExercise(event.target.value as ExerciseType)}
            >
              <option value="squat">Squat</option>
              <option value="pushup">Push-up</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(event) => setVoiceEnabled(event.target.checked)}
            />
            Voice count valid actions
          </label>

          <div className="metric-grid">
            <div><span>Current Reps</span><strong>{coachState.reps}</strong></div>
            <div><span>Current Valid</span><strong>{coachState.validReps}</strong></div>
            <div><span>FPS</span><strong>{coachState.fps}</strong></div>
            <div><span>Confidence</span><strong>{Math.round(coachState.confidence * 100)}%</strong></div>
          </div>

          <div className="feedback-box">
            <span>{coachState.stage.toUpperCase()}</span>
            <strong>{coachState.feedback}</strong>
          </div>

          <div className="button-row">
            <button onClick={startLocalSession} disabled={sessionActive}>
              Start session
            </button>

            <button
              className={setActive ? "stop-set" : "start-set"}
              onClick={toggleSet}
              disabled={!sessionActive}
            >
              {setActive ? "Stop Set" : "Start Set"}
            </button>

            <button
              className="secondary"
              onClick={finishLocalSession}
              disabled={!sessionActive}
            >
              Finish Session
            </button>
          </div>

          <dl className="status-list">
            <div><dt>Camera</dt><dd>{cameraStatus}</dd></div>
            <div><dt>Model</dt><dd>{modelStatus}</dd></div>
            <div><dt>Mode</dt><dd>{coachState.backendStatus}</dd></div>
            <div><dt>Session</dt><dd>{sessionStatus}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="panel set-table-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Temporary session table</p>
            <h2>Rep & Set Summary</h2>
          </div>

          <div className="table-totals">
            <span>Next set: {nextSetNumber}</span>
            <strong>{tableTotals.validActions}/{tableTotals.totalReps} valid</strong>
          </div>
        </div>

        {setRows.length === 0 ? (
          <p className="hint">
            No sets recorded yet. Start a session, click Start Set, perform reps, then click Stop Set.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="set-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Set Number</th>
                  <th>Valid Action</th>
                  <th>Total Reps</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {setRows.map((row) => (
                  <tr key={row.id}>
                    <td>{exerciseLabel(row.action)}</td>
                    <td>{row.setNumber}</td>
                    <td>{row.validActions}</td>
                    <td>{row.totalReps}</td>
                    <td>{row.completedAt}</td>
                    <td>
                      <button
                        className="danger small-button"
                        onClick={() => deleteSet(row.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}