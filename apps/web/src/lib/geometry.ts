import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export function angleDegrees(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const abMag = Math.hypot(ab.x, ab.y);
  const cbMag = Math.hypot(cb.x, cb.y);
  if (abMag === 0 || cbMag === 0) return 0;
  const cosine = Math.max(-1, Math.min(1, dot / (abMag * cbMag)));
  return Math.acos(cosine) * (180 / Math.PI);
}

export function avg(values: number[]): number {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function avgVisibility(points: NormalizedLandmark[]): number {
  const values = points.map((point) => point.visibility ?? 1);
  return avg(values);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
