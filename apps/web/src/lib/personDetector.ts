import {
  FilesetResolver,
  ObjectDetector,
  type Detection,
} from "@mediapipe/tasks-vision";

export type PersonBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

let detectorPromise: Promise<ObjectDetector> | null = null;

export async function getPersonDetector(): Promise<ObjectDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
      );

      return ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/efficientdet_lite0.tflite",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        maxResults: 3,
        scoreThreshold: 0.45,
        categoryAllowlist: ["person"],
      });
    })();
  }

  return detectorPromise;
}

export function getBestPersonBox(
  detections: Detection[],
  videoWidth: number,
  videoHeight: number
): PersonBox | null {
  let best: PersonBox | null = null;

  for (const detection of detections) {
    const category = detection.categories?.[0];
    const box = detection.boundingBox;

    if (!category || !box) continue;

    const name = category.categoryName?.toLowerCase();
    const score = category.score ?? 0;

    if (name !== "person") continue;
    if (score < 0.45) continue;

    const candidate: PersonBox = {
      x: box.originX ?? 0,
      y: box.originY ?? 0,
      width: box.width ?? videoWidth,
      height: box.height ?? videoHeight,
      score,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}