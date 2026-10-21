import { resolveTimelineBoundary, TimelinePlaybackClock } from "./playback-clock";
import type { PrimeTimelineDocument } from "./types";

export type TimelinePlaybackStep = Readonly<{
  document: PrimeTimelineDocument;
  direction: 1 | -1;
  stopped: boolean;
}>;

type TimelinePlaybackCallbacks = Readonly<{
  emitFrame: (step: TimelinePlaybackStep) => void;
  commitFinalFrame: (document: PrimeTimelineDocument) => void;
}>;

/**
 * Advances runtime playhead state. Authored state is committed only when a
 * once-mode boundary stops the session; ordinary display ticks only emit.
 */
export class TimelinePlaybackSession {
  private readonly clock: TimelinePlaybackClock;
  private stopped = false;
  private runtimeFrame: number;

  constructor(
    document: PrimeTimelineDocument,
    direction: 1 | -1,
    private readonly callbacks: TimelinePlaybackCallbacks,
  ) {
    this.clock = new TimelinePlaybackClock(document, direction);
    this.runtimeFrame = document.currentFrame;
  }

  advance(document: PrimeTimelineDocument, direction: 1 | -1, deltaSeconds: number): boolean {
    if (this.stopped) return false;
    if (document.currentFrame !== this.runtimeFrame) {
      this.clock.rebase(document, direction);
      this.runtimeFrame = document.currentFrame;
    }
    const requestedFrame = this.clock.advance(document, direction, deltaSeconds);
    if (requestedFrame === document.currentFrame) return true;

    const boundary = resolveTimelineBoundary(requestedFrame, direction, document);
    const next = { ...document, currentFrame: boundary.frame };
    this.runtimeFrame = next.currentFrame;
    if (boundary.direction !== direction) this.clock.rebase(next, boundary.direction);

    const step = { document: next, direction: boundary.direction, stopped: boundary.stop };
    this.callbacks.emitFrame(step);
    if (!boundary.stop) return true;

    this.stopped = true;
    this.callbacks.commitFinalFrame(next);
    return false;
  }
}
