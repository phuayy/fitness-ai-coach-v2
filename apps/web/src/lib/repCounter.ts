import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { ExerciseType, RepPayload } from "../types";
import { angleDegrees, avg, avgVisibility, clamp } from "./geometry";

type Stage = "idle" | "up" | "down";
type SquatPhase =
  | "idle"
  | "ready"
  | "descending"
  | "bottom"
  | "ascending"
  | "cooldown";

type SquatSide = "left" | "right" | "both";

interface SquatSample {
  timeMs: number;
  kneeAngle: number;
  hipY: number;
  confidence: number;
  kneeTrackingOk: boolean;
}

interface SquatMachineState {
  phase: SquatPhase;
  samples: SquatSample[];
  standingHipY?: number;
  repStartedAtMs?: number;
  descentCandidateAtMs?: number;
  bottomEnteredAtMs?: number;
  cooldownUntilMs?: number;
  startKneeAngle?: number;
  minKneeAngle: number;
  minConfidence: number;
  maxHipDropRatio: number;
  depthReached: boolean;
  kneeTrackingOk: boolean;
  lowConfidenceSinceMs?: number;
  invalidReason?: SquatInvalidReason;
}

type SquatInvalidReason =
  | "not_deep_enough"
  | "did_not_start_standing"
  | "did_not_return_standing"
  | "confidence_dropped"
  | "knee_tracking"
  | "too_fast"
  | "too_slow";

export interface CounterState {
  stage: Stage;
  reps: number;
  validReps: number;
  lastFeedback: string;
  lastConfidence: number;
  lastPayload?: RepPayload;
  squat?: SquatMachineState;
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

export function updateCounter(
  exercise: ExerciseType,
  landmarks: NormalizedLandmark[],
  state: CounterState,
  nowMs = currentTimeMs()
): CounterState {
  if (landmarks.length < 33) return state;
  return exercise === "squat"
    ? updateSquat(landmarks, state, nowMs)
    : updatePushup(landmarks, state);
}

const SQUAT_CONFIG = {
  sampleWindow: 5,
  standingKneeAngle: 155,
  returnKneeAngle: 150,
  depthKneeAngle: 110,
  deepestExpectedKneeAngle: 65,
  hipDepthRatio: 0.08,
  hipReturnTolerance: 0.04,
  minConfidence: 0.55,
  activeConfidenceFloor: 0.45,
  lowConfidenceGraceMs: 400,
  descentConfirmMs: 200,
  bottomConfirmMs: 120,
  minRepDurationMs: 700,
  maxRepDurationMs: 8000,
  cooldownMs: 350,
  stableHipRange: 0.025,
  stableKneeRange: 12,
  descentAngleDelta: 8,
  descentHipDelta: 0.025,
  severeKneeCaveRatio: 0.55,
  minAnkleWidthForKneeTracking: 0.08
};

function currentTimeMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function defaultSquatMachine(): SquatMachineState {
  return {
    phase: "idle",
    samples: [],
    minKneeAngle: 180,
    minConfidence: 1,
    maxHipDropRatio: 0,
    depthReached: false,
    kneeTrackingOk: true
  };
}

function resetSquatAttempt(
  machine: SquatMachineState,
  phase: SquatPhase,
  nowMs: number
): SquatMachineState {
  return {
    ...machine,
    phase,
    repStartedAtMs: undefined,
    descentCandidateAtMs: undefined,
    bottomEnteredAtMs: undefined,
    cooldownUntilMs: phase === "cooldown" ? nowMs + SQUAT_CONFIG.cooldownMs : undefined,
    startKneeAngle: undefined,
    minKneeAngle: 180,
    minConfidence: 1,
    maxHipDropRatio: 0,
    depthReached: false,
    kneeTrackingOk: true,
    lowConfidenceSinceMs: undefined,
    invalidReason: undefined
  };
}

function visibilityOf(point: NormalizedLandmark | undefined): number {
  return point?.visibility ?? 0;
}

function sideVisibility(lm: NormalizedLandmark[], side: "left" | "right"): number {
  return side === "left"
    ? avgVisibility([lm[23], lm[25], lm[27]])
    : avgVisibility([lm[24], lm[26], lm[28]]);
}

function hasVisibleLeg(lm: NormalizedLandmark[], side: "left" | "right"): boolean {
  const indexes = side === "left" ? [23, 25, 27] : [24, 26, 28];
  return indexes.every((index) => visibilityOf(lm[index]) >= SQUAT_CONFIG.activeConfidenceFloor);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function range(values: number[]): number {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function allLegsVisible(lm: NormalizedLandmark[]): boolean {
  return hasVisibleLeg(lm, "left") && hasVisibleLeg(lm, "right");
}

function kneeTrackingOk(lm: NormalizedLandmark[]): boolean {
  if (!allLegsVisible(lm)) return true;

  const ankleWidth = Math.abs(lm[27].x - lm[28].x);
  if (ankleWidth < SQUAT_CONFIG.minAnkleWidthForKneeTracking) return true;

  const kneeWidth = Math.abs(lm[25].x - lm[26].x);
  return kneeWidth / ankleWidth >= SQUAT_CONFIG.severeKneeCaveRatio;
}

function squatSideMetrics(lm: NormalizedLandmark[]) {
  const leftVisible = hasVisibleLeg(lm, "left");
  const rightVisible = hasVisibleLeg(lm, "right");
  const leftKnee = angleDegrees(lm[23], lm[25], lm[27]);
  const rightKnee = angleDegrees(lm[24], lm[26], lm[28]);
  const leftVisibility = sideVisibility(lm, "left");
  const rightVisibility = sideVisibility(lm, "right");

  if (leftVisible && rightVisible) {
    return {
      side: "both" as SquatSide,
      kneeAngle: Math.max(leftKnee, rightKnee),
      hipY: avg([lm[23].y, lm[24].y]),
      confidence: clamp(Math.min(leftVisibility, rightVisibility)),
      kneeTrackingOk: kneeTrackingOk(lm)
    };
  }

  const useLeft = leftVisibility >= rightVisibility;
  const side = useLeft ? "left" : "right";
  const hipIndex = useLeft ? 23 : 24;

  return {
    side: side as SquatSide,
    kneeAngle: useLeft ? leftKnee : rightKnee,
    hipY: lm[hipIndex].y,
    confidence: clamp(Math.max(leftVisibility, rightVisibility) * 0.92),
    kneeTrackingOk: true
  };
}

function appendSquatSample(
  machine: SquatMachineState,
  sample: SquatSample
): SquatMachineState {
  return {
    ...machine,
    samples: [...machine.samples, sample].slice(-SQUAT_CONFIG.sampleWindow)
  };
}

function smoothSquatSample(machine: SquatMachineState): SquatSample {
  const samples = machine.samples;
  const latest = samples[samples.length - 1];

  return {
    timeMs: latest.timeMs,
    kneeAngle: median(samples.map((sample) => sample.kneeAngle)),
    hipY: median(samples.map((sample) => sample.hipY)),
    confidence: median(samples.map((sample) => sample.confidence)),
    kneeTrackingOk: samples.every((sample) => sample.kneeTrackingOk)
  };
}

function stableStanding(sample: SquatSample, machine: SquatMachineState): boolean {
  const recent = machine.samples.slice(-3);

  return (
    sample.confidence >= SQUAT_CONFIG.minConfidence &&
    sample.kneeAngle >= SQUAT_CONFIG.standingKneeAngle &&
    recent.length >= 3 &&
    range(recent.map((item) => item.hipY)) <= SQUAT_CONFIG.stableHipRange &&
    range(recent.map((item) => item.kneeAngle)) <= SQUAT_CONFIG.stableKneeRange
  );
}

function hipDropRatio(sample: SquatSample, machine: SquatMachineState): number {
  if (machine.standingHipY === undefined) return 0;
  return Math.max(0, sample.hipY - machine.standingHipY);
}

function depthReached(sample: SquatSample, machine: SquatMachineState): boolean {
  const kneeDepth =
    sample.kneeAngle <= SQUAT_CONFIG.depthKneeAngle &&
    sample.kneeAngle >= SQUAT_CONFIG.deepestExpectedKneeAngle;

  return kneeDepth || hipDropRatio(sample, machine) >= SQUAT_CONFIG.hipDepthRatio;
}

function returnedToStanding(sample: SquatSample, machine: SquatMachineState): boolean {
  const hipReturned =
    machine.standingHipY === undefined ||
    hipDropRatio(sample, machine) <= SQUAT_CONFIG.hipReturnTolerance;

  return sample.kneeAngle >= SQUAT_CONFIG.returnKneeAngle && hipReturned;
}

function descentCandidate(sample: SquatSample, machine: SquatMachineState): boolean {
  if (machine.standingHipY === undefined || machine.startKneeAngle === undefined) {
    return false;
  }

  return (
    machine.startKneeAngle - sample.kneeAngle >= SQUAT_CONFIG.descentAngleDelta ||
    hipDropRatio(sample, machine) >= SQUAT_CONFIG.descentHipDelta
  );
}

function publicSquatStage(phase: SquatPhase): Stage {
  if (phase === "idle") return "idle";
  if (phase === "descending" || phase === "bottom" || phase === "ascending") {
    return "down";
  }
  return "up";
}

function invalidFeedback(reason: SquatInvalidReason | undefined, rep: number): string {
  if (reason === "not_deep_enough") return `Rep ${rep}: recorded, but go deeper.`;
  if (reason === "did_not_return_standing") {
    return `Rep ${rep}: recorded, but return fully upright.`;
  }
  if (reason === "confidence_dropped") {
    return `Rep ${rep}: recorded, but stay fully in frame.`;
  }
  if (reason === "knee_tracking") {
    return `Rep ${rep}: recorded, but keep knees tracking over your feet.`;
  }
  if (reason === "too_fast") return `Rep ${rep}: recorded, but move with control.`;
  if (reason === "too_slow") return `Rep ${rep}: recorded, but keep the motion continuous.`;
  return `Rep ${rep}: recorded, but start tall and finish tall.`;
}

function finishSquatRep(
  state: CounterState,
  machine: SquatMachineState,
  sample: SquatSample,
  side: SquatSide,
  nowMs: number,
  invalidReason?: SquatInvalidReason
): CounterState {
  const reps = state.reps + 1;
  const durationMs = Math.max(0, nowMs - (machine.repStartedAtMs ?? nowMs));
  const durationReason =
    durationMs < SQUAT_CONFIG.minRepDurationMs
      ? "too_fast"
      : durationMs > SQUAT_CONFIG.maxRepDurationMs
        ? "too_slow"
        : undefined;
  const finalInvalidReason =
    invalidReason ??
    machine.invalidReason ??
    durationReason ??
    (!machine.depthReached ? "not_deep_enough" : undefined) ??
    (!returnedToStanding(sample, machine) ? "did_not_return_standing" : undefined) ??
    (!machine.kneeTrackingOk ? "knee_tracking" : undefined);
  const isValid = finalInvalidReason === undefined;
  const validReps = isValid ? state.validReps + 1 : state.validReps;
  const feedback = isValid ? `Rep ${reps}: counted.` : invalidFeedback(finalInvalidReason, reps);
  const confidence = clamp(Math.min(machine.minConfidence, sample.confidence));
  const payload: RepPayload = {
    rep_index: reps,
    is_valid: isValid,
    confidence,
    feedback,
    metrics: {
      exercise: "squat",
      min_knee_angle: Math.round(machine.minKneeAngle),
      start_knee_angle: Math.round(machine.startKneeAngle ?? sample.kneeAngle),
      end_knee_angle: Math.round(sample.kneeAngle),
      hip_drop_ratio: Number(machine.maxHipDropRatio.toFixed(3)),
      duration_ms: Math.round(durationMs),
      side,
      depth_reached: machine.depthReached,
      returned_to_standing: returnedToStanding(sample, machine),
      knee_tracking_ok: machine.kneeTrackingOk,
      confidence_floor: Number(confidence.toFixed(3)),
      invalid_reason: finalInvalidReason
    }
  };

  return {
    ...state,
    stage: "up",
    reps,
    validReps,
    lastFeedback: feedback,
    lastConfidence: confidence,
    lastPayload: payload,
    squat: resetSquatAttempt(machine, "cooldown", nowMs)
  };
}

function updateSquat(
  lm: NormalizedLandmark[],
  state: CounterState,
  nowMs: number
): CounterState {
  const metrics = squatSideMetrics(lm);
  let machine = appendSquatSample(state.squat ?? defaultSquatMachine(), {
    timeMs: nowMs,
    kneeAngle: metrics.kneeAngle,
    hipY: metrics.hipY,
    confidence: metrics.confidence,
    kneeTrackingOk: metrics.kneeTrackingOk
  });
  const sample = smoothSquatSample(machine);
  let feedback = state.lastFeedback;

  machine = {
    ...machine,
    minKneeAngle: Math.min(machine.minKneeAngle, sample.kneeAngle),
    minConfidence: Math.min(machine.minConfidence, sample.confidence),
    maxHipDropRatio: Math.max(machine.maxHipDropRatio, hipDropRatio(sample, machine)),
    depthReached: machine.depthReached || depthReached(sample, machine),
    kneeTrackingOk: machine.kneeTrackingOk && sample.kneeTrackingOk
  };

  if (sample.confidence < SQUAT_CONFIG.activeConfidenceFloor) {
    const lowConfidenceSinceMs = machine.lowConfidenceSinceMs ?? nowMs;
    machine = {
      ...machine,
      lowConfidenceSinceMs
    };

    if (nowMs - lowConfidenceSinceMs >= SQUAT_CONFIG.lowConfidenceGraceMs) {
      machine = { ...machine, invalidReason: "confidence_dropped" };
    }

    return {
      ...state,
      stage: publicSquatStage(machine.phase),
      lastFeedback: "Move fully into frame.",
      lastConfidence: sample.confidence,
      lastPayload: undefined,
      squat: machine
    };
  }

  machine = { ...machine, lowConfidenceSinceMs: undefined };

  if (machine.phase === "cooldown") {
    if (nowMs < (machine.cooldownUntilMs ?? 0)) {
      return {
        ...state,
        stage: "up",
        lastConfidence: sample.confidence,
        lastPayload: undefined,
        squat: machine
      };
    }

    machine = resetSquatAttempt(machine, stableStanding(sample, machine) ? "ready" : "idle", nowMs);
  }

  if (machine.phase === "idle") {
    if (stableStanding(sample, machine)) {
      machine = {
        ...resetSquatAttempt(machine, "ready", nowMs),
        standingHipY: sample.hipY,
        startKneeAngle: sample.kneeAngle
      };
      feedback = "Lower under control.";
    } else {
      feedback =
        sample.kneeAngle < SQUAT_CONFIG.returnKneeAngle
          ? "Stand tall to start."
          : "Stand in frame to begin.";
    }
  } else if (machine.phase === "ready") {
    const nextStandingHipY =
      machine.standingHipY === undefined
        ? sample.hipY
        : machine.standingHipY * 0.85 + sample.hipY * 0.15;

    machine = {
      ...machine,
      standingHipY: nextStandingHipY,
      startKneeAngle: machine.startKneeAngle ?? sample.kneeAngle
    };

    if (descentCandidate(sample, machine)) {
      const descentCandidateAtMs = machine.descentCandidateAtMs ?? nowMs;
      machine = { ...machine, descentCandidateAtMs };

      if (nowMs - descentCandidateAtMs >= SQUAT_CONFIG.descentConfirmMs) {
        machine = {
          ...machine,
          phase: "descending",
          repStartedAtMs: descentCandidateAtMs,
          minKneeAngle: sample.kneeAngle,
          minConfidence: sample.confidence,
          maxHipDropRatio: hipDropRatio(sample, machine),
          depthReached: depthReached(sample, machine),
          kneeTrackingOk: sample.kneeTrackingOk
        };
      }
    } else {
      machine = { ...machine, descentCandidateAtMs: undefined };
    }

    feedback = "Lower under control.";
  } else if (machine.phase === "descending") {
    if (nowMs - (machine.repStartedAtMs ?? nowMs) > SQUAT_CONFIG.maxRepDurationMs) {
      machine = { ...machine, invalidReason: "too_slow" };
    }

    if (depthReached(sample, machine)) {
      const bottomEnteredAtMs = machine.bottomEnteredAtMs ?? nowMs;
      machine = { ...machine, bottomEnteredAtMs };

      if (nowMs - bottomEnteredAtMs >= SQUAT_CONFIG.bottomConfirmMs) {
        machine = { ...machine, phase: "bottom", depthReached: true };
        feedback = "Good depth. Drive up.";
      } else {
        feedback = "Good depth. Drive up.";
      }
    } else if (returnedToStanding(sample, machine)) {
      return finishSquatRep(state, machine, sample, metrics.side, nowMs, "not_deep_enough");
    } else {
      feedback = "Lower under control.";
    }
  } else if (machine.phase === "bottom") {
    if (returnedToStanding(sample, machine)) {
      return finishSquatRep(state, machine, sample, metrics.side, nowMs);
    }

    const risingFromBottom =
      machine.samples.length >= 2 &&
      sample.kneeAngle - machine.minKneeAngle >= SQUAT_CONFIG.descentAngleDelta;

    if (risingFromBottom) {
      machine = { ...machine, phase: "ascending" };
      feedback = "Finish tall to count.";
    } else {
      feedback = "Good depth. Drive up.";
    }
  } else if (machine.phase === "ascending") {
    if (returnedToStanding(sample, machine)) {
      return finishSquatRep(state, machine, sample, metrics.side, nowMs);
    }

    if (nowMs - (machine.repStartedAtMs ?? nowMs) > SQUAT_CONFIG.maxRepDurationMs) {
      machine = { ...machine, invalidReason: "too_slow" };
    }

    feedback = "Finish tall to count.";
  }

  return {
    ...state,
    stage: publicSquatStage(machine.phase),
    lastFeedback: feedback,
    lastConfidence: sample.confidence,
    lastPayload: undefined,
    squat: machine
  };
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
