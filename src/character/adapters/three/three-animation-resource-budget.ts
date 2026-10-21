import type * as THREE from "three";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

export const THREE_ANIMATION_RESOURCE_LIMITS = Object.freeze({
  maximumClipsPerCharacter: 256,
  maximumBindingsPerResource: 8,
  maximumTracksPerResource: 512,
  maximumKeyframesPerResource: 262_144,
  maximumValuesPerResource: 1_048_576,
  maximumCachedTracksPerCharacter: 4_096,
  maximumCachedKeyframesPerCharacter: 262_144,
  maximumCachedValuesPerCharacter: 1_048_576,
});

export type ThreeAnimationTrackCounts = Readonly<{
  tracks: number;
  keyframes: number;
  values: number;
}>;

export type ThreeAnimationTrackCollection = readonly Pick<
  THREE.KeyframeTrack,
  "times" | "values"
>[];

export function assessThreeAnimationResourceTracks(
  collections: readonly ThreeAnimationTrackCollection[],
): CharacterRuntimeResult<ThreeAnimationTrackCounts> {
  const limits = THREE_ANIMATION_RESOURCE_LIMITS;
  if (collections.length < 1 || collections.length > limits.maximumBindingsPerResource) {
    return failure(
      "three-animation-binding-limit-exceeded",
      `A Three animation resource supports 1-${limits.maximumBindingsPerResource} bindings.`,
    );
  }
  let declaredTracks = 0;
  for (const collection of collections) {
    if (!Number.isSafeInteger(collection.length)
      || collection.length > limits.maximumTracksPerResource - declaredTracks) {
      return failure(
        "three-animation-track-limit-exceeded",
        `A Three animation resource cannot exceed ${limits.maximumTracksPerResource} tracks.`,
      );
    }
    declaredTracks += collection.length;
  }
  const counts = countThreeAnimationTracks(collections);
  if (!counts) return failure(
    "invalid-three-animation-track-layout",
    "Three animation tracks require safe integral key/value lengths and at least one value per key.",
  );
  if (counts.keyframes > limits.maximumKeyframesPerResource) return failure(
    "three-animation-keyframe-limit-exceeded",
    `A Three animation resource cannot exceed ${limits.maximumKeyframesPerResource} keyframes.`,
  );
  if (counts.values > limits.maximumValuesPerResource) return failure(
    "three-animation-value-limit-exceeded",
    `A Three animation resource cannot exceed ${limits.maximumValuesPerResource} track values.`,
  );
  return characterRuntimeSuccess(counts);
}

export function extendThreeAnimationCacheBudget(
  current: ThreeAnimationTrackCounts,
  added: ThreeAnimationTrackCounts,
  owner: "canonical" | "prepared",
): CharacterRuntimeResult<ThreeAnimationTrackCounts> {
  if (!validCounts(current) || !validCounts(added)) {
    return cacheFailure(owner, "count", "Track counts must be non-negative safe integers.");
  }
  const next = addCounts(current, added);
  if (!next) return cacheFailure(owner, "count", "Track counts overflowed safe integer precision.");
  const limits = THREE_ANIMATION_RESOURCE_LIMITS;
  if (next.tracks > limits.maximumCachedTracksPerCharacter) {
    return cacheFailure(owner, "track", `A character cannot cache more than ${limits.maximumCachedTracksPerCharacter} ${owner} tracks.`);
  }
  if (next.keyframes > limits.maximumCachedKeyframesPerCharacter) {
    return cacheFailure(owner, "keyframe", `A character cannot cache more than ${limits.maximumCachedKeyframesPerCharacter} ${owner} keyframes.`);
  }
  if (next.values > limits.maximumCachedValuesPerCharacter) {
    return cacheFailure(owner, "value", `A character cannot cache more than ${limits.maximumCachedValuesPerCharacter} ${owner} track values.`);
  }
  return characterRuntimeSuccess(next);
}

export function subtractThreeAnimationTrackCounts(
  current: ThreeAnimationTrackCounts,
  removed: ThreeAnimationTrackCounts,
): ThreeAnimationTrackCounts {
  return {
    tracks: Math.max(0, current.tracks - removed.tracks),
    keyframes: Math.max(0, current.keyframes - removed.keyframes),
    values: Math.max(0, current.values - removed.values),
  };
}

export const EMPTY_THREE_ANIMATION_TRACK_COUNTS: ThreeAnimationTrackCounts = Object.freeze({
  tracks: 0,
  keyframes: 0,
  values: 0,
});

function countThreeAnimationTracks(
  collections: readonly ThreeAnimationTrackCollection[],
): ThreeAnimationTrackCounts | null {
  let tracks = 0;
  let keyframes = 0;
  let values = 0;
  for (const collection of collections) {
    for (const track of collection) {
      const nextTracks = tracks + 1;
      const nextKeyframes = keyframes + track.times.length;
      const nextValues = values + track.values.length;
      if (!Number.isSafeInteger(track.times.length) || track.times.length < 1
        || !Number.isSafeInteger(track.values.length) || track.values.length < track.times.length
        || track.values.length % track.times.length !== 0
        || !Number.isSafeInteger(nextTracks) || !Number.isSafeInteger(nextKeyframes)
        || !Number.isSafeInteger(nextValues)) return null;
      tracks = nextTracks;
      keyframes = nextKeyframes;
      values = nextValues;
    }
  }
  return { tracks, keyframes, values };
}

function addCounts(
  left: ThreeAnimationTrackCounts,
  right: ThreeAnimationTrackCounts,
): ThreeAnimationTrackCounts | null {
  const next = {
    tracks: left.tracks + right.tracks,
    keyframes: left.keyframes + right.keyframes,
    values: left.values + right.values,
  };
  return Object.values(next).every(Number.isSafeInteger) ? next : null;
}

function validCounts(value: ThreeAnimationTrackCounts): boolean {
  return Number.isSafeInteger(value.tracks) && value.tracks >= 0
    && Number.isSafeInteger(value.keyframes) && value.keyframes >= 0
    && Number.isSafeInteger(value.values) && value.values >= 0;
}

function cacheFailure(
  owner: "canonical" | "prepared",
  dimension: "count" | "track" | "keyframe" | "value",
  message: string,
): CharacterRuntimeResult<ThreeAnimationTrackCounts> {
  return failure(`three-animation-${owner}-${dimension}-limit-exceeded`, message);
}

function failure(
  code: string,
  message: string,
): CharacterRuntimeResult<ThreeAnimationTrackCounts> {
  return characterRuntimeFailure(code, message);
}
