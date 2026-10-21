export const DEFAULT_ANIMATION_DURATION = 5;
export const DEFAULT_ANIMATION_FPS = 24;
const MIN_ANIMATION_DURATION = 0.25;
const MAX_ANIMATION_DURATION = 300;

export function clampTime(time: number, duration: number) {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(time, 0), Math.max(duration, 0));
}

export function clampDuration(duration: number) {
  if (!Number.isFinite(duration)) return DEFAULT_ANIMATION_DURATION;
  return Math.min(Math.max(duration, MIN_ANIMATION_DURATION), MAX_ANIMATION_DURATION);
}

export function snapTime(time: number, fps = DEFAULT_ANIMATION_FPS) {
  if (!Number.isFinite(time)) return 0;
  const safeFps = Math.max(1, Math.round(fps));
  return Math.round(time * safeFps) / safeFps;
}

export function frameEpsilon(fps = DEFAULT_ANIMATION_FPS) {
  return 0.5 / Math.max(1, Math.round(fps));
}

export function timePercent(time: number, duration: number) {
  if (duration <= 0) return 0;
  return Math.min(Math.max((time / duration) * 100, 0), 100);
}

export function formatTimecode(time: number, fps = DEFAULT_ANIMATION_FPS) {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(time * safeFps));
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const frame = totalFrames % safeFps;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
}
