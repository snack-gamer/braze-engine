import type { SceneObject } from "../types";
import { createAuthoredId } from "../identity/authored-id";
import type { AnimationDocument, MotionClipSource, MotionClipTrack } from "./types";
import { clampTime } from "./time";

function findMotionClipTrack(document: AnimationDocument, objectId: string) {
  return document.tracks.find(
    (track): track is MotionClipTrack => track.kind === "motionClip" && track.objectId === objectId,
  );
}

function createMotionClipTrack(object: Pick<SceneObject, "id" | "name">): MotionClipTrack {
  return {
    id: `track-${object.id}-motion`,
    kind: "motionClip",
    objectId: object.id,
    label: object.name || "Motion",
    enabled: true,
    clips: [],
  };
}

export function addMotionClipInstance(
  document: AnimationDocument,
  object: Pick<SceneObject, "id" | "name">,
  source: MotionClipSource,
): AnimationDocument {
  const existingTrack = findMotionClipTrack(document, object.id);
  const track = existingTrack ?? createMotionClipTrack(object);
  const start = clampTime(document.playhead, document.duration);
  const remaining = Math.max(0.1, document.duration - start);
  const duration = Math.min(Math.max(source.duration, 0.1), remaining);
  const nextTrack: MotionClipTrack = {
    ...track,
    label: object.name || track.label,
    clips: [
      ...track.clips,
      {
        id: createAuthoredId("clip"),
        sourceId: source.id,
        name: source.name,
        start,
        duration,
        offset: 0,
        weight: 1,
        retarget: source.retarget,
      },
    ].sort((a, b) => a.start - b.start),
  };
  const tracks = existingTrack
    ? document.tracks.map((item) => (item.id === nextTrack.id ? nextTrack : item))
    : [...document.tracks, nextTrack];
  const motionSources = new Map(document.motionSources.map((item) => [item.id, item]));
  motionSources.set(source.id, source);
  return { ...document, motionSources: [...motionSources.values()], tracks };
}

export function addMotionSources(document: AnimationDocument, sources: MotionClipSource[]): AnimationDocument {
  if (sources.length === 0) return document;
  const byId = new Map(document.motionSources.map((source) => [source.id, source]));
  for (const source of sources) byId.set(source.id, source);
  return { ...document, motionSources: [...byId.values()] };
}

export function removeMotionClipInstance(
  document: AnimationDocument,
  trackId: string,
  clipId: string,
): AnimationDocument {
  return {
    ...document,
    tracks: document.tracks
      .map((track) => {
        if (track.id !== trackId || track.kind !== "motionClip") return track;
        return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
      })
      .filter((track) => track.kind !== "motionClip" || track.clips.length > 0),
  };
}

export function updateMotionClipInstance(
  document: AnimationDocument,
  trackId: string,
  clipId: string,
  patch: Partial<Pick<MotionClipTrack["clips"][number], "start" | "duration" | "offset" | "weight" | "retarget">>,
): AnimationDocument {
  return {
    ...document,
    tracks: document.tracks.map((track) => {
      if (track.id !== trackId || track.kind !== "motionClip") return track;
      return {
        ...track,
        clips: track.clips
          .map((clip) => {
            if (clip.id !== clipId) return clip;
            return {
              ...clip,
              start: clampTime(patch.start ?? clip.start, document.duration),
              duration: Math.max(0.1, patch.duration ?? clip.duration),
              offset: Math.max(0, patch.offset ?? clip.offset),
              weight: Math.min(Math.max(patch.weight ?? clip.weight, 0), 1),
              retarget: patch.retarget ?? clip.retarget,
            };
          })
          .sort((a, b) => a.start - b.start),
      };
    }),
  };
}
