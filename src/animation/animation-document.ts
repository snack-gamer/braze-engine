import type { AnimationDocument, MotionClipTrack, TransformAnimationTrack } from "./types";
import {
  clampDuration,
  clampTime,
  DEFAULT_ANIMATION_DURATION,
  DEFAULT_ANIMATION_FPS,
  snapTime,
} from "./time";

export function createAnimationDocument(): AnimationDocument {
  return {
    version: 1,
    duration: DEFAULT_ANIMATION_DURATION,
    fps: DEFAULT_ANIMATION_FPS,
    playhead: 0,
    loop: true,
    motionSources: [],
    tracks: [],
  };
}

export function findTransformTrack(document: AnimationDocument, objectId: string) {
  return document.tracks.find(
    (track): track is TransformAnimationTrack => (
      track.kind === "transform" && track.objectId === objectId
    ),
  );
}

export function findMotionClipTrack(document: AnimationDocument, objectId: string) {
  return document.tracks.find(
    (track): track is MotionClipTrack => track.kind === "motionClip" && track.objectId === objectId,
  );
}

type SetAnimationPlayheadOptions = {
  snap?: boolean;
};

function stableTime(time: number): number {
  return Math.round(time * 1_000_000) / 1_000_000;
}

export function setAnimationPlayhead(
  document: AnimationDocument,
  playhead: number,
  options: SetAnimationPlayheadOptions = {},
): AnimationDocument {
  const clamped = clampTime(playhead, document.duration);
  const nextPlayhead = stableTime(
    options.snap === false ? clamped : snapTime(clamped, document.fps),
  );
  return nextPlayhead === document.playhead
    ? document
    : { ...document, playhead: nextPlayhead };
}

export function setAnimationDuration(
  document: AnimationDocument,
  duration: number,
): AnimationDocument {
  const nextDuration = clampDuration(duration);
  return {
    ...document,
    duration: nextDuration,
    playhead: clampTime(document.playhead, nextDuration),
  };
}
