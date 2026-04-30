import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { ExerciseType, RepPayload } from "../types";
import { angleDegrees, avgVisibility, clamp } from "./geometry";

type Stage = "idle" | "up" | "down";

export interface CounterState {
  stage: Stage;
  reps: number;
  validReps: number;
  lastFeedback: string;
  lastConfidence: number;
  lastPayload?: RepPayload;
}

export function createCounterState(): CounterState {
  return {
    stage: "idle",
    reps: 0,
    validReps: 0,
    lastFeedback: "Stand in frame to begin.",
    lastConfidence: 0
  };
}

export function updateCounter(exercise: ExerciseType, landmarks: NormalizedLandmark[], state: CounterState): CounterState {
  if (landmarks.length < 33) return state;
  return exercise === "squat" ? updateSquat(landmarks, state) : updatePushup(landmarks, state);
}

function updateSquat(lm: NormalizedLandmark[], state: CounterState): CounterState {
  const leftKnee = angleDegrees(lm[23], lm[25], lm[27]);
  const rightKnee = angleDegrees(lm[24], lm[26], lm[28]);
  const leftVisibility = avgVisibility([lm[23], lm[25], lm[27]]);
  const rightVisibility = avgVisibility([lm[24], lm[26], lm[28]]);
  const useLeft = leftVisibility >= rightVisibility;
  const kneeAngle = useLeft ? leftKnee : rightKnee;
  const visibility = Math.max(leftVisibility, rightVisibility);
  const depthOk = kneeAngle < 105;
  const standing = kneeAngle > 160;
  const confidence = clamp(visibility);
  let feedback = state.lastFeedback;
  let stage = state.stage;
  let reps = state.reps;
  let validReps = state.validReps;
  let payload: RepPayload | undefined;

  if (confidence < 0.45) {
    return { ...state, lastFeedback: "Move fully into frame.", lastConfidence: confidence, lastPayload: undefined };
  }

  if ((stage === "idle" || stage === "up") && depthOk) {
    stage = "down";
    feedback = "Good depth. Drive up with control.";
  }

  if (stage === "down" && standing) {
    reps += 1;
    const isValid = true;
    if (isValid) validReps += 1;
    feedback = `Rep ${reps}: counted.`;
    payload = {
      rep_index: reps,
      is_valid: isValid,
      confidence,
      feedback,
      metrics: {
        knee_angle: Math.round(kneeAngle),
        side: useLeft ? "left" : "right",
        exercise: "squat"
      }
    };
    stage = "up";
  } else if (stage !== "down") {
    feedback = kneeAngle < 130 ? "Lower under control." : "Ready. Start your squat.";
  }

  return { stage, reps, validReps, lastFeedback: feedback, lastConfidence: confidence, lastPayload: payload };
}

function sideScore(points: NormalizedLandmark[]): number {
  return avgVisibility(points);
}

function updatePushup(lm: NormalizedLandmark[], state: CounterState): CounterState {
  const leftElbowAngle = angleDegrees(lm[11], lm[13], lm[15]);
  const rightElbowAngle = angleDegrees(lm[12], lm[14], lm[16]);

  const leftVisibility = sideScore([lm[11], lm[13], lm[15], lm[23]]);
  const rightVisibility = sideScore([lm[12], lm[14], lm[16], lm[24]]);

  const useLeft = leftVisibility >= rightVisibility;

  const elbowAngle = useLeft ? leftElbowAngle : rightElbowAngle;

  const shoulder = useLeft ? lm[11] : lm[12];
  const hip = useLeft ? lm[23] : lm[24];

  const confidence = clamp(Math.max(leftVisibility, rightVisibility));

  const down = elbowAngle < 95;
  const up = elbowAngle > 155;

  const hipShoulderDelta = Math.abs(hip.y - shoulder.y);
  const bodyLineOk = hipShoulderDelta < 0.28;

  let feedback = state.lastFeedback;
  let stage = state.stage;
  let reps = state.reps;
  let validReps = state.validReps;
  let payload: RepPayload | undefined;

  if (confidence < 0.4) {
    return {
      ...state,
      lastFeedback: "Move shoulder, elbow, wrist, and hip into view.",
      lastConfidence: confidence,
      lastPayload: undefined
    };
  }

  if ((stage === "idle" || stage === "up") && down) {
    stage = "down";
    feedback = bodyLineOk ? "Good depth. Press up." : "Keep hips and shoulders aligned.";
  }

  if (stage === "down" && up) {
    reps += 1;

    const isValid = bodyLineOk;

    if (isValid) validReps += 1;

    feedback = isValid
      ? `Rep ${reps}: counted.`
      : `Rep ${reps}: counted, but keep a straighter body line.`;

    payload = {
      rep_index: reps,
      is_valid: isValid,
      confidence,
      feedback,
      metrics: {
        elbow_angle: Math.round(elbowAngle),
        body_line_delta: Number(hipShoulderDelta.toFixed(3)),
        exercise: "pushup"
      }
    };

    stage = "up";
  } else if (stage !== "down") {
    feedback = elbowAngle < 135 ? "Lower with control." : "Ready. Start your push-up.";
  }

  return {
    stage,
    reps,
    validReps,
    lastFeedback: feedback,
    lastConfidence: confidence,
    lastPayload: payload
  };
}
