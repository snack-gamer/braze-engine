import type { SceneObject, Vec3 } from "../types";
import type {
  AnimatedTransform,
  AnimationTrack,
  TransformAnimationTrack,
  TransformChannel,
  TransformChannelKeyframe,
  TransformKeyframe,
} from "./types";
import { channelHasKeys, ensureTransformChannels, setTransformValue } from "./channels";
import { sampleCurveValue } from "./curves";
import { animationPlayerSubtree } from "./scope";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function sameVec3(a: Vec3, b: Vec3) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function sameTransform(object: SceneObject, transform: AnimatedTransform) {
  return (
    sameVec3(object.position, transform.position) &&
    sameVec3(object.rotation, transform.rotation) &&
    sameVec3(object.scale, transform.scale)
  );
}

function sortedKeyframes(track: TransformAnimationTrack) {
  return [...track.keyframes].sort((a, b) => a.time - b.time);
}

function cloneTransform(transform: AnimatedTransform): AnimatedTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
    scale: [...transform.scale],
  };
}

type CompiledTransformChannel = Omit<TransformChannel, "keys"> & {
  keys: TransformChannelKeyframe[];
};

type CompiledTransformTrack = {
  objectId: string;
  channels: CompiledTransformChannel[];
  keyframes: TransformKeyframe[];
};

export type AnimationEvaluationPlan = {
  tracks: Map<string, CompiledTransformTrack>;
  lastKeyTime: number;
};

const EMPTY_PLAN: AnimationEvaluationPlan = {
  tracks: new Map(),
  lastKeyTime: 0,
};

function blendKeyframes(a: TransformKeyframe, b: TransformKeyframe, time: number): AnimatedTransform {
  const span = b.time - a.time;
  const t = span <= 0 ? 0 : Math.min(Math.max((time - a.time) / span, 0), 1);
  return {
    position: lerpVec3(a.transform.position, b.transform.position, t),
    rotation: lerpVec3(a.transform.rotation, b.transform.rotation, t),
    scale: lerpVec3(a.transform.scale, b.transform.scale, t),
  };
}

function sampleChannel(channel: CompiledTransformChannel, time: number): number | null {
  return sampleCurveValue(channel.keys, time);
}

function sampleTrack(
  track: CompiledTransformTrack,
  time: number,
  fallback: AnimatedTransform,
): AnimatedTransform | null {
  if (track.channels.length > 0) {
    let transform = cloneTransform(fallback);
    let changed = false;
    for (const channel of track.channels) {
      const value = sampleChannel(channel, time);
      if (value === null) continue;
      transform = setTransformValue(transform, channel.property, channel.axis, value);
      changed = true;
    }
    return changed ? transform : null;
  }

  const keyframes = track.keyframes;
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1 || time <= keyframes[0].time) return cloneTransform(keyframes[0].transform);
  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) return cloneTransform(last.transform);
  let low = 0;
  let high = keyframes.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (keyframes[mid].time <= time) low = mid;
    else high = mid;
  }
  return blendKeyframes(keyframes[low], keyframes[high], time);
}

function compileTransformTrack(track: TransformAnimationTrack): { track: CompiledTransformTrack; lastKeyTime: number } | null {
  const channels = ensureTransformChannels({ id: track.objectId }, track.channels, track.keyframes)
    .map((channel): CompiledTransformChannel => ({
      ...channel,
      keys: [...channel.keys].sort((a, b) => a.time - b.time),
    }))
    .filter(channelHasKeys);
  const keyframes = channels.length > 0 ? [] : sortedKeyframes(track);
  let lastKeyTime = 0;
  for (const channel of channels) {
    const last = channel.keys[channel.keys.length - 1];
    if (last) lastKeyTime = Math.max(lastKeyTime, last.time);
  }
  for (const keyframe of keyframes) lastKeyTime = Math.max(lastKeyTime, keyframe.time);
  if (lastKeyTime <= 0 && channels.length === 0 && keyframes.length === 0) return null;
  return {
    track: {
      objectId: track.objectId,
      channels,
      keyframes,
    },
    lastKeyTime,
  };
}

export function createAnimationEvaluationPlan(objects: SceneObject[], tracks: AnimationTrack[]): AnimationEvaluationPlan {
  const playerRoots = objects.filter((object) => object.animationPlayer && object.animationPlayer.enabled !== false);
  if (playerRoots.length === 0) return EMPTY_PLAN;
  const animatableIds = new Set<string>();
  for (const root of playerRoots) {
    for (const row of animationPlayerSubtree(objects, root.id)) animatableIds.add(row.object.id);
  }

  const compiledTracks = new Map<string, CompiledTransformTrack>();
  let lastKeyTime = 0;
  for (const track of tracks) {
    if (track.kind !== "transform" || !track.enabled || !animatableIds.has(track.objectId)) continue;
    const compiled = compileTransformTrack(track);
    if (!compiled) continue;
    compiledTracks.set(track.objectId, compiled.track);
    lastKeyTime = Math.max(lastKeyTime, compiled.lastKeyTime);
  }
  if (compiledTracks.size === 0) return EMPTY_PLAN;
  return { tracks: compiledTracks, lastKeyTime };
}

export function evaluateAnimationPlan(
  objects: SceneObject[],
  plan: AnimationEvaluationPlan,
  playhead: number,
): SceneObject[] {
  if (plan.tracks.size === 0) return objects;

  let changed = false;
  const next = objects.map((object) => {
    const track = plan.tracks.get(object.id);
    if (!track) return object;
    const transform = sampleTrack(track, playhead, object);
    if (!transform || sameTransform(object, transform)) return object;
    changed = true;
    return { ...object, ...transform };
  });
  return changed ? next : objects;
}

export function animationPlanObjectIds(plan: AnimationEvaluationPlan): string[] {
  return [...plan.tracks.keys()];
}

/** Evaluates only the preselected objects that actually own transform tracks.
 * The live viewport uses this narrow path so a two-track animation in a large
 * city does not map and clone the entire SceneObject array every frame. */
export function evaluateAnimationPlanTargets(
  trackedObjects: SceneObject[],
  plan: AnimationEvaluationPlan,
  playhead: number,
): SceneObject[] {
  const evaluated: SceneObject[] = [];
  for (const object of trackedObjects) {
    const track = plan.tracks.get(object.id);
    if (!track) continue;
    const transform = sampleTrack(track, playhead, object);
    evaluated.push(transform && !sameTransform(object, transform) ? { ...object, ...transform } : object);
  }
  return evaluated;
}
