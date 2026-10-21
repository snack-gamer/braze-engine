import type { TimelinePlaybackSource } from "./playback-state";
import type {
  SequencerSectionPatch,
  SequencerTrackCreateOptions,
  SequencerTrackPatch,
} from "./track-authoring";
import type {
  PrimeTimelineDocument,
  PrimeTimelineFrameListener,
  PrimeTimelineFrameMode,
  PrimeTimelinePlayMode,
  SequencerSectionKind,
  SequencerTrackKind,
} from "./types";

export type PrimeTimelineController = {
  document: PrimeTimelineDocument;
  serializedDocument: PrimeTimelineDocument;
  playback: TimelinePlaybackSource;
  playing: boolean;
  direction: 1 | -1;
  currentFrame: number;
  currentTime: number;
  duration: number;
  fps: number;
  setFrame: (frame: number) => void;
  setTime: (time: number) => void;
  setFps: (fps: number) => void;
  setDuration: (duration: number) => void;
  setRange: (minFrame: number, maxFrame: number) => void;
  setPreviewRange: (startFrame: number, endFrame: number) => void;
  setPlayMode: (mode: PrimeTimelinePlayMode) => void;
  setFrameMode: (mode: PrimeTimelineFrameMode) => void;
  toggleLoop: () => void;
  togglePlayback: () => void;
  playForward: () => void;
  playBackward: () => void;
  pause: () => void;
  stepFrame: (delta: number) => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;
  addSequencerTrack: (
    kind?: SequencerTrackKind,
    options?: SequencerTrackCreateOptions,
  ) => { trackId: string; sectionId: string };
  removeSequencerTrack: (trackId: string) => void;
  updateSequencerTrack: (trackId: string, patch: SequencerTrackPatch) => void;
  addSequencerSection: (trackId: string, kind?: SequencerSectionKind) => string;
  removeSequencerSection: (trackId: string, sectionId: string) => void;
  updateSequencerSection: (trackId: string, sectionId: string, patch: SequencerSectionPatch) => void;
  loadDocument: (document: PrimeTimelineDocument | undefined) => void;
  subscribeFrame: (listener: PrimeTimelineFrameListener) => () => void;
};
