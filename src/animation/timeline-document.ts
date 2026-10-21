import { frameToTime, primeTimelineDuration } from "../timeline/document";
import type { PrimeTimelineDocument } from "../timeline/types";
import type { AnimationDocument } from "./types";

/** Projects timeline-owned transport fields onto animation-authored tracks. */
export function animationDocumentAtTimeline(
  source: AnimationDocument,
  timeline: PrimeTimelineDocument,
  playhead = frameToTime(timeline.currentFrame, timeline.fps),
): AnimationDocument {
  const duration = primeTimelineDuration(timeline);
  return {
    ...source,
    duration,
    fps: timeline.fps,
    playhead: Math.min(Math.max(0, playhead), duration),
    loop: timeline.playMode !== "once",
  };
}
