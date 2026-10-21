export type PrimeTimelinePlayMode = "once" | "loop" | "pingpong";
export type PrimeTimelineFrameMode = "realtime" | "allFrames";
export type SequencerTrackKind = "master" | "animation" | "activation" | "property" | "system";
export type SequencerSectionKind = "range" | "animation" | "activation" | "property";

export type SequencerSectionValue = string | number | boolean;

export type SequencerSection = {
  id: string;
  name: string;
  kind: SequencerSectionKind;
  startFrame: number;
  endFrame: number;
  enabled: boolean;
  color?: string;
  targetObjectId?: string;
  propertyPath?: string;
  value?: SequencerSectionValue;
};

export type SequencerTrack = {
  id: string;
  name: string;
  kind: SequencerTrackKind;
  enabled: boolean;
  targetObjectId?: string;
  sections: SequencerSection[];
};

export type SequencerActiveSection = SequencerSection & {
  trackId: string;
  trackName: string;
  trackKind: SequencerTrackKind;
};

export type PrimeTimelineDocument = {
  version: 1;
  fps: number;
  minFrame: number;
  maxFrame: number;
  previewStartFrame: number;
  previewEndFrame: number;
  currentFrame: number;
  playMode: PrimeTimelinePlayMode;
  frameMode: PrimeTimelineFrameMode;
  tracks: SequencerTrack[];
};

export type PrimeTimelineSample = {
  time: number;
  frame: number;
  fps: number;
  deltaTime: number;
  deltaFrames: number;
  playing: boolean;
  scrubbing: boolean;
  direction: 1 | -1;
  resetToken: number;
  minFrame: number;
  maxFrame: number;
  previewStartFrame: number;
  previewEndFrame: number;
  playMode: PrimeTimelinePlayMode;
  frameMode: PrimeTimelineFrameMode;
  activeSections: SequencerActiveSection[];
};

export type PrimeTimelineFrameListener = (sample: PrimeTimelineSample) => void;
