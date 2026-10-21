const SAMPLE_INTERVAL_MS = 250;
const FPS_SMOOTHING = 0.4;

export type ViewportFrameRate = Readonly<{
  fps: number;
  frameMs: number;
}>;

export type ViewportFrameRateSampler = {
  sample: (nowMilliseconds: number) => ViewportFrameRate | null;
};

/** Samples already-submitted viewport frames without scheduling independent work. */
export function createViewportFrameRateSampler(): ViewportFrameRateSampler {
  let firstFrameAt: number | null = null;
  let frames = 0;
  let smoothedFps: number | null = null;

  return {
    sample(nowMilliseconds) {
      if (!Number.isFinite(nowMilliseconds)) return null;
      if (firstFrameAt === null) {
        firstFrameAt = nowMilliseconds;
        return null;
      }
      frames += 1;
      const elapsed = nowMilliseconds - firstFrameAt;
      if (elapsed < SAMPLE_INTERVAL_MS || elapsed <= 0) return null;
      const instantFps = frames * 1000 / elapsed;
      smoothedFps = smoothedFps === null
        ? instantFps
        : smoothedFps * (1 - FPS_SMOOTHING) + instantFps * FPS_SMOOTHING;
      frames = 0;
      firstFrameAt = nowMilliseconds;
      return { fps: smoothedFps, frameMs: 1000 / smoothedFps };
    },
  };
}
