import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const CONNECTIONS: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [29, 31], [28, 30], [30, 32]
];

export function drawPose(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks.length) return;

  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
  ctx.fillStyle = "rgba(34, 197, 94, 0.95)";

  for (const [from, to] of CONNECTIONS) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.35 || (b.visibility ?? 1) < 0.35) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  for (const point of landmarks) {
    if ((point.visibility ?? 1) < 0.35) continue;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
