import {
  FilesetResolver,
  ObjectDetector,
  PoseLandmarker
} from "@mediapipe/tasks-vision";
import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import visionWasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";
import visionWasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import { useEffect, useMemo, useRef, useState } from "react";

import { drawPose } from "../lib/drawPose";
import { humanGate } from "../lib/humanGate";
import { getExercisePoseQuality } from "../lib/poseQuality";
import { createCounterState, updateCounter } from "../lib/repCounter";
import {
  createCameraFrame,
  DEFAULT_CAMERA_FRAME,
  useAdaptiveVideoLayout
} from "../lib/useAdaptiveVideoLayout";
import type { CoachFrameState, ExerciseType, SetRecord } from "../types";

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
type MediaPipeDelegate = "CPU" | "GPU";

type LandmarkerInitResult = {
  landmarker: PoseLandmarker;
  delegate: MediaPipeDelegate;
};

type DetectorInitResult = {
  detector: ObjectDetector;
  delegate: MediaPipeDelegate;
};

const LOCAL_WASM_FILESET = {
  wasmLoaderPath: visionWasmLoaderUrl,
  wasmBinaryPath: visionWasmBinaryUrl
} satisfies VisionFileset;

const MODEL_URL =
  import.meta.env.VITE_POSE_MODEL_URL || "/models/pose_landmarker_full.task";

const PERSON_MODEL_URL =
  import.meta.env.VITE_PERSON_MODEL_URL || "/models/efficientdet_lite0_uint8.tflite";

const ENABLE_PERSON_DETECTOR =
  import.meta.env.VITE_ENABLE_PERSON_GATE === "true";

const ALLOW_PARTIAL_POSE_FALLBACK =
  import.meta.env.VITE_ALLOW_PARTIAL_POSE_FALLBACK !== "false";

const PREFERRED_DELEGATE: MediaPipeDelegate =
  import.meta.env.VITE_MEDIAPIPE_DELEGATE === "GPU" ? "GPU" : "CPU";

const POSE_DETECT_EVERY_MS = Math.max(
  0,
  Number(import.meta.env.VITE_POSE_DETECT_EVERY_MS || 66)
);

const PERSON_DETECT_EVERY_MS = Number(
  import.meta.env.VITE_PERSON_DETECT_EVERY_MS || 250
);

const WASM_URL = import.meta.env.VITE_MEDIAPIPE_WASM_URL?.trim();

function exerciseLabel(value: ExerciseType): string {
  return value === "pushup" ? "Push-up" : "Squat";
}

function delegateFallbacks(): MediaPipeDelegate[] {
  return PREFERRED_DELEGATE === "GPU" ? ["GPU", "CPU"] : ["CPU"];
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function resolveVisionFileset(): Promise<VisionFileset> {
  if (WASM_URL) {
    return FilesetResolver.forVisionTasks(WASM_URL);
  }

  return LOCAL_WASM_FILESET;
}

async function createLandmarker(vision: VisionFileset): Promise<LandmarkerInitResult> {
  let lastError: unknown;

  for (const delegate of delegateFallbacks()) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.65,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.65
      });

      return { landmarker, delegate };
    } catch (error) {
      lastError = error;
      console.warn(`[pose] ${delegate} landmarker failed.`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Pose model startup failed");
}

async function createPersonDetector(
  vision: VisionFileset
): Promise<DetectorInitResult | null> {
  if (!ENABLE_PERSON_DETECTOR) return null;

  let lastError: unknown;

  for (const delegate of delegateFallbacks()) {
    try {
      const detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: PERSON_MODEL_URL,
          delegate
        },
        runningMode: "VIDEO",
        maxResults: 3,
        scoreThreshold: 0.5,
        categoryAllowlist: ["person"]
      });

      return { detector, delegate };
    } catch (error) {
      lastError = error;
      console.warn(`[person-gate] ${delegate} detector failed.`, error);
    }
  }

  console.warn("[person-gate] Person detector unavailable.", lastError);
  return null;
}

export function LocalPoseCoach() {
  const videoCardRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);

  const lastDetectorResultRef = useRef<unknown | null>(null);
  const lastPersonDetectTsRef = useRef(0);

  const animationRef = useRef<number | null>(null);
  const counterRef = useRef(createCounterState());
  const lastVideoTimeRef = useRef(-1);
  const lastPoseDetectTsRef = useRef(0);

  const framesRef = useRef({
    count: 0,
    lastTs: performance.now(),
    fps: 0,
    lastUiTs: 0
  });

  const exerciseRef = useRef<ExerciseType>("squat");
  const cameraFrameRef = useRef(DEFAULT_CAMERA_FRAME);
  const sessionActiveRef = useRef(false);
  const setActiveRef = useRef(false);
  const setRowsRef = useRef<SetRecord[]>([]);
  const nextSetNumberRef = useRef(1);
  const voiceEnabledRef = useRef(true);

  const [exercise, setExercise] = useState<ExerciseType>("squat");
  const [cameraFrame, setCameraFrame] = useState(DEFAULT_CAMERA_FRAME);
  const [cameraStatus, setCameraStatus] = useState("Camera not started");
  const [modelStatus, setModelStatus] = useState("Model loading...");
  const [personStatus, setPersonStatus] = useState(
    ENABLE_PERSON_DETECTOR
      ? "Person detector waiting for pose model..."
      : "Pose-only human gate waiting for pose model..."
  );
  const [sessionStatus, setSessionStatus] = useState(
    "Click Start session to begin temporary local set tracking."
  );

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

  const videoLayout = useAdaptiveVideoLayout(videoCardRef, cameraFrame);
  const cameraStatusText =
    cameraStatus === "Camera running locally"
      ? `${cameraStatus} (${cameraFrame.width} x ${cameraFrame.height}, ${cameraFrame.orientation})`
      : cameraStatus;

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
        if (!video) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();
        syncCameraFrame(video.videoWidth, video.videoHeight);
        setCameraStatus("Camera running locally");

        setModelStatus(
          WASM_URL ? "Loading MediaPipe runtime..." : "Loading bundled MediaPipe runtime..."
        );
        setPersonStatus(
          ENABLE_PERSON_DETECTOR
            ? "Person detector will start after the pose model."
            : "Pose-only human gate will start after the pose model."
        );
        await yieldToBrowser();

        const vision = await resolveVisionFileset();

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setModelStatus(`Loading pose model (${PREFERRED_DELEGATE})...`);
        await yieldToBrowser();

        const landmarkerInit = await createLandmarker(vision);

        if (cancelled) {
          landmarkerInit.landmarker.close();
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        landmarkerRef.current = landmarkerInit.landmarker;
        setModelStatus(`Pose model ready (${landmarkerInit.delegate})`);
        setPersonStatus(
          ENABLE_PERSON_DETECTOR
            ? "Loading optional person detector..."
            : "Pose-only human gate active"
        );

        runLoop();

        if (ENABLE_PERSON_DETECTOR) {
          await yieldToBrowser();
          const detectorInit = await createPersonDetector(vision);

          if (cancelled) {
            detectorInit?.detector.close();
            return;
          }

          objectDetectorRef.current = detectorInit?.detector ?? null;

          setPersonStatus(
            detectorInit
              ? `Person detector ready (${detectorInit.delegate})`
              : ALLOW_PARTIAL_POSE_FALLBACK
                ? "Person detector unavailable. Pose-only fallback is active."
                : "Person detector unavailable. Reps are paused."
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Camera/model startup failed";

        console.error("[pose] Startup failed.", error);
        setCameraStatus((current) =>
          current === "Camera running locally" ? current : message
        );
        setModelStatus("Not ready");
        setPersonStatus(message);
      }
    }

    start();

    return () => {
      cancelled = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());

      landmarkerRef.current?.close();
      objectDetectorRef.current?.close();

      landmarkerRef.current = null;
      objectDetectorRef.current = null;
      lastDetectorResultRef.current = null;

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

  function syncCameraFrame(width: number, height: number) {
    if (!width || !height) return;

    const nextFrame = createCameraFrame(width, height);
    const currentFrame = cameraFrameRef.current;

    if (
      nextFrame.width === currentFrame.width &&
      nextFrame.height === currentFrame.height
    ) {
      return;
    }

    cameraFrameRef.current = nextFrame;
    setCameraFrame(nextFrame);
  }

  function syncCameraFrameFromVideo() {
    const video = videoRef.current;
    if (!video) return;

    syncCameraFrame(video.videoWidth, video.videoHeight);
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

    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.currentTime !== lastVideoTimeRef.current
    ) {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const now = performance.now();

      syncCameraFrame(width, height);

      if (now - lastPoseDetectTsRef.current < POSE_DETECT_EVERY_MS) {
        animationRef.current = requestAnimationFrame(runLoop);
        return;
      }

      lastVideoTimeRef.current = video.currentTime;
      lastPoseDetectTsRef.current = now;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const detector = objectDetectorRef.current;

      if (
        ENABLE_PERSON_DETECTOR &&
        detector &&
        now - lastPersonDetectTsRef.current >= PERSON_DETECT_EVERY_MS
      ) {
        try {
          lastDetectorResultRef.current = detector.detectForVideo(video, now);
          lastPersonDetectTsRef.current = now;
        } catch (error) {
          console.warn("[person-gate] Frame detection failed.", error);
          lastDetectorResultRef.current = null;
        }
      }

      const result: PoseLandmarkerResult = landmarker.detectForVideo(video, now);
      const landmarks = result.landmarks[0] ?? [];

      const rawHuman = humanGate(
        exerciseRef.current,
        landmarks,
        lastDetectorResultRef.current,
        width,
        height
      );

      const human =
        ENABLE_PERSON_DETECTOR &&
        !ALLOW_PARTIAL_POSE_FALLBACK &&
        !rawHuman.personBox
          ? {
              ...rawHuman,
              ok: false,
              confidence: Math.min(rawHuman.confidence, 0.2),
              feedback: detector
                ? "No confirmed human object detected. Reps are paused."
                : "Person detector unavailable. Reps are paused."
            }
          : rawHuman;

      const quality = human.ok
        ? getExercisePoseQuality(exerciseRef.current, landmarks)
        : {
            ok: false,
            feedback: human.feedback,
            confidence: human.confidence
          };

      const shouldDrawAndCount = human.ok && quality.ok;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.clearRect(0, 0, width, height);

        if (landmarks.length >= 33) {
          drawPose(ctx, landmarks, width, height);
        }
      }

      if (shouldDrawAndCount && setActiveRef.current) {
        const previousValidReps = counterRef.current.validReps;

        counterRef.current = updateCounter(
          exerciseRef.current,
          landmarks,
          counterRef.current
        );

        if (counterRef.current.validReps > previousValidReps) {
          speakValidCount(counterRef.current.validReps);
        }
      } else if (!shouldDrawAndCount) {
        counterRef.current = {
          ...counterRef.current,
          lastFeedback: quality.feedback,
          lastConfidence: quality.confidence,
          lastPayload: undefined
        };
      }

      framesRef.current.count += 1;

      if (now - framesRef.current.lastTs >= 1000) {
        framesRef.current.fps = framesRef.current.count;
        framesRef.current.count = 0;
        framesRef.current.lastTs = now;
      }

      if (now - framesRef.current.lastUiTs > 180) {
        framesRef.current.lastUiTs = now;

        const counter = counterRef.current;

        setPersonStatus(human.feedback);

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
      feedback: `Set ${nextSetNumberRef.current} started. Begin ${exerciseLabel(
        exerciseRef.current
      )}.`
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
        <div
          ref={videoCardRef}
          className="video-card"
          data-camera-orientation={cameraFrame.orientation}
        >
          <div
            className="video-shell"
            data-camera-orientation={cameraFrame.orientation}
            data-camera-resolution={`${cameraFrame.width}x${cameraFrame.height}`}
            style={videoLayout.style}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className="camera-video"
              onLoadedMetadata={syncCameraFrameFromVideo}
              onResize={syncCameraFrameFromVideo}
            />
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
            <div>
              <span>Current Reps</span>
              <strong>{coachState.reps}</strong>
            </div>
            <div>
              <span>Current Valid</span>
              <strong>{coachState.validReps}</strong>
            </div>
            <div>
              <span>FPS</span>
              <strong>{coachState.fps}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{Math.round(coachState.confidence * 100)}%</strong>
            </div>
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
            <div>
              <dt>Camera</dt>
              <dd>{cameraStatusText}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{modelStatus}</dd>
            </div>
            <div>
              <dt>Human gate</dt>
              <dd>{personStatus}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{coachState.backendStatus}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{sessionStatus}</dd>
            </div>
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
            <strong>
              {tableTotals.validActions}/{tableTotals.totalReps} valid
            </strong>
          </div>
        </div>

        {setRows.length === 0 ? (
          <p className="hint">
            No sets recorded yet. Start a session, click Start Set, perform reps,
            then click Stop Set.
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
