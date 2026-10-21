import { frameToTime } from "./document";
import type {
  PrimeTimelineDocument,
  PrimeTimelineSample,
  SequencerActiveSection,
} from "./types";

export type TimelinePlaybackIntent = Readonly<{
  playing: boolean;
  scrubbing: boolean;
  direction: 1 | -1;
}>;

export type TimelinePlaybackSource = Readonly<{
  getSnapshot: () => PrimeTimelineSample;
  subscribe: (listener: () => void) => () => void;
}>;

function activeSectionsForDocument(document: PrimeTimelineDocument): SequencerActiveSection[] {
  const activeSections: SequencerActiveSection[] = [];
  for (const track of document.tracks) {
    if (!track.enabled) continue;
    for (const section of track.sections) {
      if (!section.enabled) continue;
      if (document.currentFrame < section.startFrame || document.currentFrame > section.endFrame) continue;
      activeSections.push({
        ...section,
        trackId: track.id,
        trackName: track.name,
        trackKind: track.kind,
      });
    }
  }
  return activeSections;
}

export function createTimelinePlaybackSample(
  document: PrimeTimelineDocument,
  previousFrame: number,
  resetToken: number,
  intent: TimelinePlaybackIntent,
): PrimeTimelineSample {
  const deltaFrames = document.currentFrame - previousFrame;
  return {
    time: frameToTime(document.currentFrame, document.fps),
    frame: document.currentFrame,
    fps: document.fps,
    deltaTime: deltaFrames / document.fps,
    deltaFrames,
    playing: intent.playing,
    scrubbing: intent.scrubbing,
    direction: intent.direction,
    resetToken,
    minFrame: document.minFrame,
    maxFrame: document.maxFrame,
    previewStartFrame: document.previewStartFrame,
    previewEndFrame: document.previewEndFrame,
    playMode: document.playMode,
    frameMode: document.frameMode,
    activeSections: activeSectionsForDocument(document),
  };
}

/**
 * External playback state for frame-rate UI. Publishing here never mutates the
 * authored timeline document or schedules a render of the application shell.
 */
export class TimelinePlaybackStore {
  private readonly listeners = new Set<() => void>();

  constructor(private snapshot: PrimeTimelineSample) {}

  readonly getSnapshot = (): PrimeTimelineSample => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(sample: PrimeTimelineSample): void {
    this.snapshot = sample;
    for (const listener of this.listeners) listener();
  }
}
