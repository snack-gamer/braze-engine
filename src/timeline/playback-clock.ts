import type { PrimeTimelineDocument } from "./types";

export type TimelineBoundary = {
  frame: number;
  direction: 1 | -1;
  stop: boolean;
};

export function resolveTimelineBoundary(
  frame: number,
  direction: 1 | -1,
  document: PrimeTimelineDocument,
): TimelineBoundary {
  const start = document.previewStartFrame;
  const end = document.previewEndFrame;
  const length = Math.max(1, end - start + 1);
  if (frame >= start && frame <= end) return { frame, direction, stop: false };

  if (document.playMode === "once") {
    return { frame: direction > 0 ? end : start, direction, stop: true };
  }

  if (document.playMode === "loop") {
    const offset = ((frame - start) % length + length) % length;
    return { frame: start + offset, direction, stop: false };
  }

  const span = Math.max(1, end - start);
  const period = span * 2;
  const offset = ((frame - start) % period + period) % period;
  return {
    frame: offset <= span ? start + offset : end - (offset - span),
    direction: offset <= span ? 1 : -1,
    stop: false,
  };
}

/** Converts shared EngineLoop deltas into timeline-frame requests. */
export class TimelinePlaybackClock {
  private anchorFrame: number;
  private elapsedSeconds = 0;
  private allFramesElapsedSeconds = 0;
  private direction: 1 | -1;
  private fps: number;
  private frameMode: PrimeTimelineDocument["frameMode"];

  constructor(document: PrimeTimelineDocument, direction: 1 | -1) {
    this.anchorFrame = document.currentFrame;
    this.direction = direction;
    this.fps = document.fps;
    this.frameMode = document.frameMode;
  }

  advance(document: PrimeTimelineDocument, direction: 1 | -1, deltaSeconds: number): number {
    if (direction !== this.direction || document.fps !== this.fps || document.frameMode !== this.frameMode) {
      this.rebase(document, direction);
    }
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (document.frameMode === "allFrames") {
      this.allFramesElapsedSeconds += delta;
      const frameDuration = 1 / document.fps;
      if (this.allFramesElapsedSeconds + Number.EPSILON < frameDuration) return document.currentFrame;
      // All-frames mode never skips authored frames. Whole-frame backlog is
      // intentionally discarded after a delayed display callback.
      this.allFramesElapsedSeconds %= frameDuration;
      return document.currentFrame + direction;
    }

    this.elapsedSeconds += delta;
    const elapsedFrames = Math.floor(this.elapsedSeconds * document.fps + 1.0e-9);
    return this.anchorFrame + elapsedFrames * direction;
  }

  rebase(document: PrimeTimelineDocument, direction: 1 | -1): void {
    this.anchorFrame = document.currentFrame;
    this.elapsedSeconds = 0;
    this.allFramesElapsedSeconds = 0;
    this.direction = direction;
    this.fps = document.fps;
    this.frameMode = document.frameMode;
  }
}
