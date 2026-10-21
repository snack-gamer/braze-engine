import { frameToTime, timeToFrame } from "./document";
import type {
  PrimeTimelineDocument,
  SequencerSection,
  SequencerSectionKind,
  SequencerTrack,
  SequencerTrackKind,
} from "./types";

export type SequencerTrackPatch = Partial<Pick<SequencerTrack, "name" | "enabled" | "targetObjectId">>;
export type SequencerSectionPatch = Partial<Pick<
  SequencerSection,
  "name" | "kind" | "startFrame" | "endFrame" | "enabled" | "color" | "targetObjectId" | "propertyPath" | "value"
>>;
export type SequencerTrackCreateOptions = {
  name?: string;
  targetObjectId?: string;
  sectionKind?: SequencerSectionKind;
  sectionName?: string;
};

export function sameTimelineDocument(a: PrimeTimelineDocument, b: PrimeTimelineDocument): boolean {
  return (
    a.fps === b.fps &&
    a.minFrame === b.minFrame &&
    a.maxFrame === b.maxFrame &&
    a.previewStartFrame === b.previewStartFrame &&
    a.previewEndFrame === b.previewEndFrame &&
    a.currentFrame === b.currentFrame &&
    a.playMode === b.playMode &&
    a.frameMode === b.frameMode &&
    (a.tracks === b.tracks || JSON.stringify(a.tracks) === JSON.stringify(b.tracks))
  );
}

export function normalizeTimelineFrame(frame: number, document: PrimeTimelineDocument): number {
  return Math.min(document.maxFrame, Math.max(document.minFrame, Math.round(frame)));
}

export function retimeTracks(tracks: SequencerTrack[], oldFps: number, nextFps: number): SequencerTrack[] {
  return tracks.map((track) => ({
    ...track,
    sections: track.sections.map((section) => ({
      ...section,
      startFrame: timeToFrame(frameToTime(section.startFrame, oldFps), nextFps),
      endFrame: timeToFrame(frameToTime(section.endFrame, oldFps), nextFps),
    })),
  }));
}

export function stretchTracksToDuration(
  tracks: SequencerTrack[],
  oldMaxFrame: number,
  nextMaxFrame: number,
): SequencerTrack[] {
  return tracks.map((track) => ({
    ...track,
    sections: track.sections.map((section) => ({
      ...section,
      startFrame: Math.min(section.startFrame, nextMaxFrame),
      endFrame: section.endFrame >= oldMaxFrame ? nextMaxFrame : Math.min(section.endFrame, nextMaxFrame),
    })),
  }));
}

export function sectionKindForTrack(kind: SequencerTrackKind): SequencerSectionKind {
  if (kind === "animation") return "animation";
  if (kind === "activation") return "activation";
  if (kind === "property") return "property";
  return "range";
}
