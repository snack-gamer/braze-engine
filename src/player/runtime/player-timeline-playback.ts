import { sharedBrowserEngineLoop } from "../../runtime/browser-engine-loop";
import type { EngineLoopParticipant } from "../../runtime/engine-loop";
import { TimelinePlaybackSession } from "../../timeline/playback-session";
import { createTimelinePlaybackSample } from "../../timeline/playback-state";
import type { PrimeTimelineDocument, PrimeTimelineSample } from "../../timeline/types";

export type PlayerTimelinePlayback = Readonly<{
  subscribe: (listener: (sample: PrimeTimelineSample) => void) => () => void;
  start: () => void;
  dispose: () => void;
}>;

/** Owns continuous timeline playback without importing editor transport/authoring hooks. */
export function createPlayerTimelinePlayback(
  initialDocument: PrimeTimelineDocument,
): PlayerTimelinePlayback {
  const listeners = new Set<(sample: PrimeTimelineSample) => void>();
  let document = initialDocument;
  let direction: 1 | -1 = 1;
  let previousFrame = initialDocument.currentFrame;
  let disposed = false;
  let started = false;
  let participant: EngineLoopParticipant | null = null;
  let sample = createTimelinePlaybackSample(document, previousFrame, 0, {
    playing: true,
    scrubbing: false,
    direction,
  });

  const publish = (playing: boolean) => {
    sample = createTimelinePlaybackSample(document, previousFrame, 0, {
      playing,
      scrubbing: false,
      direction,
    });
    previousFrame = document.currentFrame;
    for (const listener of listeners) listener(sample);
  };
  const playback = new TimelinePlaybackSession(document, direction, {
    emitFrame: (step) => {
      document = step.document;
      direction = step.direction;
      publish(!step.stopped);
    },
    commitFinalFrame: (finalDocument) => {
      document = finalDocument;
    },
  });

  return {
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      listener(sample);
      return () => listeners.delete(listener);
    },
    start: () => {
      if (disposed || started) return;
      started = true;
      participant = sharedBrowserEngineLoop().createParticipant({
        timeline: ({ deltaSeconds }) => {
          const continuing = playback.advance(document, direction, deltaSeconds);
          if (continuing) participant?.requestFrame();
        },
      });
      participant.requestFrame();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      participant?.dispose();
      participant = null;
      listeners.clear();
    },
  };
}
