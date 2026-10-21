import { useMemo } from "react";
import { frameToTime, primeTimelineDuration } from "./document";
import type { PrimeTimelineController } from "./prime-timeline-controller";
import type { PrimeTimelineDocument } from "./types";
import { useTimelineDocumentSession } from "./useTimelineDocumentSession";
import { useTimelineRangeAuthoring } from "./useTimelineRangeAuthoring";
import { useTimelineTrackAuthoring } from "./useTimelineTrackAuthoring";
import { useTimelineTransport } from "./useTimelineTransport";

export type { PrimeTimelineController } from "./prime-timeline-controller";

/** Composes the timeline session, authored commands, and runtime transport. */
export function usePrimeTimeline(initialDocument?: PrimeTimelineDocument): PrimeTimelineController {
  const session = useTimelineDocumentSession(initialDocument);
  const range = useTimelineRangeAuthoring(session);
  const transport = useTimelineTransport(session, range.setFrame);
  const tracks = useTimelineTrackAuthoring(session);

  return useMemo(() => ({
    document: session.document,
    serializedDocument: session.serializedDocument,
    playback: session.playback,
    playing: session.playing,
    direction: session.direction,
    currentFrame: session.document.currentFrame,
    currentTime: frameToTime(session.document.currentFrame, session.document.fps),
    duration: primeTimelineDuration(session.document),
    fps: session.document.fps,
    ...range,
    ...transport,
    ...tracks,
    loadDocument: session.loadDocument,
    subscribeFrame: session.subscribeFrame,
  }), [range, session, tracks, transport]);
}
