import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { ExerciseType } from "../types";

const MIN_REQUIRED_VISIBILITY = 0.35;

function visibilityOf(point: NormalizedLandmark | undefined): number {
  if (!point) return 0;
  return point.visibility ?? 1;
}

function averageVisibility(lm: NormalizedLandmark[], indexes: number[]): number {
  if (!lm.length) return 0;

  const values = indexes.map((index) => visibilityOf(lm[index]));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function allRequiredVisible(lm: NormalizedLandmark[], indexes: number[]): boolean {
  return indexes.every((index) => visibilityOf(lm[index]) >= MIN_REQUIRED_VISIBILITY);
}

export interface PoseQualityResult {
  ok: boolean;
  confidence: number;
  side: "left" | "right" | "both" | "none";
  feedback: string;
}

/**
 * Exercise-aware pose validation.
 *
 * This prevents the app from counting or drawing confident-looking false poses
 * on background objects. It also supports partial body visibility by requiring
 * only the landmarks needed for the selected exercise.
 */
export function getExercisePoseQuality(
  exercise: ExerciseType,
  lm: NormalizedLandmark[]
): PoseQualityResult {
  if (lm.length < 33) {
    return {
      ok: false,
      confidence: 0,
      side: "none",
      feedback: "No reliable body pose detected."
    };
  }

  if (exercise === "pushup") {
    const leftSide = [11, 13, 15, 23]; // left shoulder, elbow, wrist, hip
    const rightSide = [12, 14, 16, 24]; // right shoulder, elbow, wrist, hip

    const leftScore = averageVisibility(lm, leftSide);
    const rightScore = averageVisibility(lm, rightSide);

    const leftOk = allRequiredVisible(lm, leftSide);
    const rightOk = allRequiredVisible(lm, rightSide);

    const confidence = Math.max(leftScore, rightScore);

    if (!leftOk && !rightOk) {
      return {
        ok: false,
        confidence,
        side: "none",
        feedback: "Move shoulder, elbow, wrist, and hip into view."
      };
    }

    return {
      ok: confidence >= 0.4,
      confidence,
      side: leftScore >= rightScore ? "left" : "right",
      feedback: "Push-up pose detected."
    };
  }

  if (exercise === "squat") {
    const leftSide = [23, 25, 27]; // left hip, knee, ankle
    const rightSide = [24, 26, 28]; // right hip, knee, ankle

    const leftScore = averageVisibility(lm, leftSide);
    const rightScore = averageVisibility(lm, rightSide);

    const leftOk = allRequiredVisible(lm, leftSide);
    const rightOk = allRequiredVisible(lm, rightSide);

    const confidence = Math.max(leftScore, rightScore);

    if (!leftOk && !rightOk) {
      return {
        ok: false,
        confidence,
        side: "none",
        feedback: "Move hip, knee, and ankle into view."
      };
    }

    return {
      ok: confidence >= 0.4,
      confidence,
      side: leftScore >= rightScore ? "left" : "right",
      feedback: "Squat pose detected."
    };
  }

  return {
    ok: false,
    confidence: 0,
    side: "none",
    feedback: "Unsupported exercise."
  };
}