import { createDefaultSequencerTrack, frameToTime, timeToFrame } from "./document";
import {
  retimeTracks,
  sectionKindForTrack,
  stretchTracksToDuration,
  type SequencerSectionPatch,
  type SequencerTrackCreateOptions,
  type SequencerTrackPatch,
} from "./track-authoring";
import type {
  PrimeTimelineDocument,
  SequencerSectionKind,
  SequencerTrack,
  SequencerTrackKind,
} from "./types";

export function retimeTimelinePatch(
  current: PrimeTimelineDocument,
  requestedFps: number,
): Partial<PrimeTimelineDocument> {
  const oldFps = current.fps;
  const nextFps = Math.max(1, Math.round(requestedFps));
  return {
    fps: nextFps,
    minFrame: timeToFrame(frameToTime(current.minFrame, oldFps), nextFps),
    maxFrame: timeToFrame(frameToTime(current.maxFrame, oldFps), nextFps),
    previewStartFrame: timeToFrame(frameToTime(current.previewStartFrame, oldFps), nextFps),
    previewEndFrame: timeToFrame(frameToTime(current.previewEndFrame, oldFps), nextFps),
    currentFrame: timeToFrame(frameToTime(current.currentFrame, oldFps), nextFps),
    tracks: retimeTracks(current.tracks, oldFps, nextFps),
  };
}

export function resizeTimelinePatch(
  current: PrimeTimelineDocument,
  duration: number,
): Partial<PrimeTimelineDocument> {
  const nextMax = current.minFrame + Math.max(1, timeToFrame(duration, current.fps));
  const previewTouchesEnd = current.previewEndFrame === current.maxFrame;
  return {
    maxFrame: nextMax,
    previewEndFrame: previewTouchesEnd ? nextMax : Math.min(current.previewEndFrame, nextMax),
    currentFrame: Math.min(current.currentFrame, nextMax),
    tracks: stretchTracksToDuration(current.tracks, current.maxFrame, nextMax),
  };
}

export type SequencerTrackAppend = Readonly<{
  tracks: SequencerTrack[];
  trackId: string;
  sectionId: string;
}>;

export function appendSequencerTrack(
  current: PrimeTimelineDocument,
  kind: SequencerTrackKind,
  options: SequencerTrackCreateOptions,
  trackId: string,
): SequencerTrackAppend {
  const startFrame = kind === "master" ? current.minFrame : current.currentFrame;
  const endFrame = kind === "master"
    ? current.maxFrame
    : Math.min(current.previewEndFrame, Math.max(startFrame + current.fps * 2, startFrame + 1));
  const baseTrack = createDefaultSequencerTrack(kind, startFrame, endFrame, trackId);
  const track: SequencerTrack = {
    ...baseTrack,
    name: options.name ?? baseTrack.name,
    targetObjectId: options.targetObjectId ?? baseTrack.targetObjectId,
    sections: baseTrack.sections.map((section, index) => (
      index === 0
        ? {
          ...section,
          kind: options.sectionKind ?? section.kind,
          name: options.sectionName ?? section.name,
          targetObjectId: options.targetObjectId ?? section.targetObjectId,
        }
        : section
    )),
  };
  return {
    tracks: [...current.tracks, track],
    trackId,
    sectionId: track.sections[0]?.id ?? `${trackId}-section`,
  };
}

export function removeSequencerTrack(
  tracks: SequencerTrack[],
  trackId: string,
): SequencerTrack[] {
  return tracks.filter((track) => track.id !== trackId || track.kind === "master");
}

export function updateSequencerTrack(
  tracks: SequencerTrack[],
  trackId: string,
  patch: SequencerTrackPatch,
): SequencerTrack[] {
  return tracks.map((track) => (track.id === trackId ? { ...track, ...patch } : track));
}

export function appendSequencerSection(
  current: PrimeTimelineDocument,
  trackId: string,
  sectionId: string,
  requestedKind?: SequencerSectionKind,
): SequencerTrack[] {
  return current.tracks.map((track) => {
    if (track.id !== trackId) return track;
    const sectionKind = requestedKind ?? sectionKindForTrack(track.kind);
    const startFrame = current.currentFrame;
    const endFrame = Math.min(current.previewEndFrame, Math.max(startFrame + current.fps * 2, startFrame + 1));
    const section = createDefaultSequencerTrack(track.kind, startFrame, endFrame, `scratch-${sectionId}`).sections[0];
    return {
      ...track,
      sections: [...track.sections, {
        ...section,
        id: sectionId,
        kind: sectionKind,
        name: sectionKind === "range" ? "Section" : sectionKind[0].toUpperCase() + sectionKind.slice(1),
      }],
    };
  });
}

export function removeSequencerSection(
  tracks: SequencerTrack[],
  trackId: string,
  sectionId: string,
): SequencerTrack[] {
  return tracks.map((track) => (
    track.id === trackId
      ? { ...track, sections: track.sections.filter((section) => section.id !== sectionId) }
      : track
  ));
}

export function updateSequencerSection(
  tracks: SequencerTrack[],
  trackId: string,
  sectionId: string,
  patch: SequencerSectionPatch,
): SequencerTrack[] {
  return tracks.map((track) => (
    track.id === trackId
      ? {
        ...track,
        sections: track.sections.map((section) => (
          section.id === sectionId ? { ...section, ...patch } : section
        )),
      }
      : track
  ));
}
