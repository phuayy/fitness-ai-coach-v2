import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { ExerciseType } from "../types";
import { avgVisibility, clamp } from "./geometry";

type BoxLike = {
  originX?: number;
  originY?: number;
  width?: number;
  height?: number;
  xMin?: number;
  yMin?: number;
};

type CategoryLike = {
  categoryName?: string;
  displayName?: string;
  score?: number;
};

type DetectionLike = {
  boundingBox?: BoxLike;
  categories?: CategoryLike[];
};

type DetectorResultLike = {
  detections?: DetectionLike[];
};

export type PersonBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

export type HumanGateResult = {
  ok: boolean;
  confidence: number;
  feedback: string;
  personBox?: PersonBox;
};

const HUMAN_GATE_CONFIG = {
  minPersonScore: 0.5,

  // Allows partial body views, for example neck-to-calves.
  minUsefulVisibility: 0.52,
  minVisibleUsefulPoints: 5,

  // Rejects small toy / plush / background detections.
  minPoseAreaRatio: 0.055,
  minLongSideRatio: 0.28,

  // When a person box exists, enough visible pose landmarks should be inside it.
  minInsidePersonBoxRatio: 0.45
};

function getVisibility(point: NormalizedLandmark | undefined): number {
  return point?.visibility ?? 0;
}

function visible(point: NormalizedLandmark | undefined): boolean {
  return getVisibility(point) >= HUMAN_GATE_CONFIG.minUsefulVisibility;
}

function usefulIndicesForExercise(exercise: ExerciseType): number[] {
  if (exercise === "pushup") {
    return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
  }

  return [23, 24, 25, 26, 27, 28];
}

function minVisibleUsefulPointsForExercise(exercise: ExerciseType): number {
  return exercise === "pushup" ? 4 : 3;
}

function hasExercisePoseStructure(
  exercise: ExerciseType,
  landmarks: NormalizedLandmark[]
): boolean {
  if (landmarks.length < 33) return false;

  if (exercise === "pushup") {
    const leftChain =
      visible(landmarks[11]) &&
      visible(landmarks[13]) &&
      visible(landmarks[15]) &&
      visible(landmarks[23]);

    const rightChain =
      visible(landmarks[12]) &&
      visible(landmarks[14]) &&
      visible(landmarks[16]) &&
      visible(landmarks[24]);

    return leftChain || rightChain;
  }

  const leftLeg =
    visible(landmarks[23]) &&
    visible(landmarks[25]) &&
    visible(landmarks[27]);

  const rightLeg =
    visible(landmarks[24]) &&
    visible(landmarks[26]) &&
    visible(landmarks[28]);

  return leftLeg || rightLeg;
}

function poseBox(landmarks: NormalizedLandmark[]): PersonBox | null {
  const points = landmarks.filter((point) => visible(point));

  if (points.length < HUMAN_GATE_CONFIG.minVisibleUsefulPoints) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  const minX = clamp(Math.min(...xs));
  const maxX = clamp(Math.max(...xs));
  const minY = clamp(Math.min(...ys));
  const maxY = clamp(Math.max(...ys));

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    score: 1
  };
}

function normalizedPersonBox(
  box: BoxLike | undefined,
  frameWidth: number,
  frameHeight: number
): PersonBox | null {
  if (!box || frameWidth <= 0 || frameHeight <= 0) return null;

  const originX = box.originX ?? box.xMin ?? 0;
  const originY = box.originY ?? box.yMin ?? 0;
  const width = box.width ?? 0;
  const height = box.height ?? 0;

  if (width <= 0 || height <= 0) return null;

  return {
    x: clamp(originX / frameWidth),
    y: clamp(originY / frameHeight),
    width: clamp(width / frameWidth),
    height: clamp(height / frameHeight),
    score: 0
  };
}

function isPersonCategory(category: CategoryLike | undefined): boolean {
  const name = `${category?.categoryName ?? category?.displayName ?? ""}`.toLowerCase();
  return name === "person";
}

function bestPersonDetection(
  detectorResult: unknown,
  frameWidth: number,
  frameHeight: number
): PersonBox | undefined {
  const result = detectorResult as DetectorResultLike | null | undefined;
  const detections = result?.detections ?? [];

  let best: PersonBox | undefined;

  for (const detection of detections) {
    const personCategory = detection.categories?.find(isPersonCategory);
    const score = personCategory?.score ?? 0;

    if (score < HUMAN_GATE_CONFIG.minPersonScore) continue;

    const box = normalizedPersonBox(detection.boundingBox, frameWidth, frameHeight);
    if (!box) continue;

    const candidate = { ...box, score };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

function expandBox(box: PersonBox, margin: number): PersonBox {
  return {
    x: clamp(box.x - margin),
    y: clamp(box.y - margin),
    width: clamp(box.width + margin * 2),
    height: clamp(box.height + margin * 2),
    score: box.score
  };
}

function pointInsideBox(point: NormalizedLandmark, box: PersonBox): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function insidePersonBoxRatio(
  landmarks: NormalizedLandmark[],
  personBox: PersonBox
): number {
  const visiblePoints = landmarks.filter(visible);

  if (!visiblePoints.length) return 0;

  const expanded = expandBox(personBox, 0.08);
  const insideCount = visiblePoints.filter((point) => pointInsideBox(point, expanded)).length;

  return insideCount / visiblePoints.length;
}

export function humanGate(
  exercise: ExerciseType,
  landmarks: NormalizedLandmark[],
  detectorResult: unknown,
  frameWidth: number,
  frameHeight: number
): HumanGateResult {
  if (landmarks.length < 33) {
    return {
      ok: false,
      confidence: 0,
      feedback: "No stable human pose detected."
    };
  }

  const usefulIndices = usefulIndicesForExercise(exercise);
  const usefulLandmarks = usefulIndices.map((index) => landmarks[index]).filter((point): point is NormalizedLandmark => Boolean(point));
  const visibleUsefulCount = usefulLandmarks.filter(visible).length;
  const usefulVisibility = avgVisibility(usefulLandmarks);
  const minVisibleUsefulPoints = minVisibleUsefulPointsForExercise(exercise);

  if (!hasExercisePoseStructure(exercise, landmarks)) {
    return {
      ok: false,
      confidence: clamp(usefulVisibility),
      feedback:
        exercise === "pushup"
          ? "Move a shoulder-elbow-wrist-hip chain into view."
          : "Move hip-knee-ankle into view."
    };
  }

  if (visibleUsefulCount < minVisibleUsefulPoints) {
    return {
      ok: false,
      confidence: clamp(usefulVisibility),
      feedback: "Not enough visible body landmarks. Move more of your body into frame."
    };
  }

  const detectedPerson = bestPersonDetection(detectorResult, frameWidth, frameHeight);

  if (detectedPerson) {
    const insideRatio = insidePersonBoxRatio(landmarks, detectedPerson);
    const confidence = clamp(Math.min(detectedPerson.score, usefulVisibility));

    if (insideRatio >= HUMAN_GATE_CONFIG.minInsidePersonBoxRatio) {
      return {
        ok: true,
        confidence,
        feedback: "Human detected.",
        personBox: detectedPerson
      };
    }

    return {
      ok: false,
      confidence,
      feedback: "Pose is not aligned with the detected person. Reposition yourself."
    };
  }

  const box = poseBox(landmarks);

  if (!box) {
    return {
      ok: false,
      confidence: clamp(usefulVisibility),
      feedback: "No person detected. Move closer to the camera."
    };
  }

  const poseArea = box.width * box.height;
  const longSide = Math.max(box.width, box.height);

  const strongPartialHumanPose =
    usefulVisibility >= 0.62 &&
    poseArea >= HUMAN_GATE_CONFIG.minPoseAreaRatio &&
    longSide >= HUMAN_GATE_CONFIG.minLongSideRatio;

  if (strongPartialHumanPose) {
    return {
      ok: true,
      confidence: clamp(usefulVisibility * 0.78),
      feedback: "Partial human body accepted."
    };
  }

  return {
    ok: false,
    confidence: clamp(usefulVisibility * 0.5),
    feedback: "No clear person detected. Avoid toys, pillows, or background objects in frame."
  };
}
