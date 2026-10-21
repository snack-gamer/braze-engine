import type { SceneObject } from "../scene/domain/scene-object";
import { createAuthoredId } from "../identity/authored-id";
import { ensureTransformChannels, transformValue } from "./channels";
import { findTransformTrack } from "./animation-document";
import { clampTime, frameEpsilon, snapTime } from "./time";
import type {
  AnimationDocument,
  TransformAnimationTrack,
  TransformAxis,
  TransformChannelKeyframe,
  TransformProperty,
} from "./types";

function createTransformTrack(
  object: Pick<SceneObject, "id" | "name">,
): TransformAnimationTrack {
  return {
    id: `track-${object.id}-transform`,
    kind: "transform",
    objectId: object.id,
    label: object.name || "Object",
    enabled: true,
    channels: ensureTransformChannels(object, []),
    keyframes: [],
  };
}

function upsertChannelKey(
  keys: TransformChannelKeyframe[],
  keyframe: TransformChannelKeyframe,
  fps: number,
): TransformChannelKeyframe[] {
  const epsilon = frameEpsilon(fps);
  const existingIndex = keys.findIndex((item) => Math.abs(item.time - keyframe.time) <= epsilon);
  const next = existingIndex >= 0
    ? keys.map((item, index) => index === existingIndex
      ? {
          ...keyframe,
          id: item.id,
          interpolation: item.interpolation,
          inTangent: item.inTangent,
          outTangent: item.outTangent,
        }
      : item)
    : [...keys, keyframe];
  return next.sort((left, right) => left.time - right.time);
}

export function upsertTransformKeyframe(
  document: AnimationDocument,
  object: Pick<SceneObject, "id" | "name" | "position" | "rotation" | "scale">,
  time: number,
): AnimationDocument {
  const snappedTime = snapTime(clampTime(time, document.duration), document.fps);
  const existingTrack = findTransformTrack(document, object.id);
  const track = existingTrack ?? createTransformTrack(object);
  const channels = ensureTransformChannels(object, track.channels, track.keyframes).map((channel) => ({
    ...channel,
    keys: upsertChannelKey(channel.keys, {
      id: createAuthoredId("ck"),
      time: snappedTime,
      value: transformValue(object, channel.property, channel.axis),
      interpolation: "linear",
    }, document.fps),
  }));
  const nextTrack: TransformAnimationTrack = {
    ...track,
    label: object.name || track.label,
    channels,
    keyframes: [],
  };
  const tracks = existingTrack
    ? document.tracks.map((item) => item.id === nextTrack.id ? nextTrack : item)
    : [...document.tracks, nextTrack];
  return { ...document, tracks };
}

export function upsertTransformChannelKeyframe(
  document: AnimationDocument,
  object: Pick<SceneObject, "id" | "name" | "position" | "rotation" | "scale">,
  property: TransformProperty,
  axis: TransformAxis,
  time: number,
): AnimationDocument {
  const snappedTime = snapTime(clampTime(time, document.duration), document.fps);
  const existingTrack = findTransformTrack(document, object.id);
  const track = existingTrack ?? createTransformTrack(object);
  const channels = ensureTransformChannels(object, track.channels, track.keyframes).map((channel) => {
    if (channel.property !== property || channel.axis !== axis) return channel;
    return {
      ...channel,
      keys: upsertChannelKey(channel.keys, {
        id: createAuthoredId("ck"),
        time: snappedTime,
        value: transformValue(object, property, axis),
        interpolation: "linear",
      }, document.fps),
    };
  });
  const nextTrack: TransformAnimationTrack = {
    ...track,
    label: object.name || track.label,
    channels,
  };
  const tracks = existingTrack
    ? document.tracks.map((item) => item.id === nextTrack.id ? nextTrack : item)
    : [...document.tracks, nextTrack];
  return { ...document, tracks };
}
