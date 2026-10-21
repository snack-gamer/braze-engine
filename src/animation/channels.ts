import type { SceneObject, Vec3 } from "../types";
import type {
  AnimatedTransform,
  TransformAxis,
  TransformChannel,
  TransformChannelKeyframe,
  TransformKeyframe,
  TransformProperty,
} from "./types";

export const TRANSFORM_PROPERTIES: TransformProperty[] = ["position", "rotation", "scale"];
export const TRANSFORM_AXES: TransformAxis[] = [0, 1, 2];
export const AXIS_LABELS = ["X", "Y", "Z"] as const;
export const CHANNEL_COLORS: Record<(typeof AXIS_LABELS)[number], string> = {
  X: "#e66f6f",
  Y: "#66c785",
  Z: "#68a9ee",
};

function transformChannelId(objectId: string, property: TransformProperty, axis: TransformAxis) {
  return `track-${objectId}-transform-${property}-${AXIS_LABELS[axis].toLowerCase()}`;
}

export function transformValue(transform: AnimatedTransform, property: TransformProperty, axis: TransformAxis) {
  return transform[property][axis];
}

export function setTransformValue(
  transform: AnimatedTransform,
  property: TransformProperty,
  axis: TransformAxis,
  value: number,
): AnimatedTransform {
  const next = {
    position: [...transform.position] as Vec3,
    rotation: [...transform.rotation] as Vec3,
    scale: [...transform.scale] as Vec3,
  };
  next[property][axis] = value;
  return next;
}

function emptyChannel(objectId: string, property: TransformProperty, axis: TransformAxis): TransformChannel {
  return {
    id: transformChannelId(objectId, property, axis),
    property,
    axis,
    enabled: true,
    keys: [],
  };
}

function emptyTransformChannels(objectId: string): TransformChannel[] {
  return TRANSFORM_PROPERTIES.flatMap((property) => TRANSFORM_AXES.map((axis) => emptyChannel(objectId, property, axis)));
}

function migrateTransformKeyframesToChannels(
  objectId: string,
  keyframes: TransformKeyframe[],
): TransformChannel[] {
  return emptyTransformChannels(objectId).map((channel) => ({
    ...channel,
    keys: keyframes.map((keyframe): TransformChannelKeyframe => ({
      id: `${keyframe.id}-${channel.property}-${AXIS_LABELS[channel.axis].toLowerCase()}`,
      time: keyframe.time,
      value: transformValue(keyframe.transform, channel.property, channel.axis),
      interpolation: "linear",
    })),
  }));
}

export function ensureTransformChannels(
  object: Pick<SceneObject, "id">,
  channels: TransformChannel[] | undefined,
  keyframes: TransformKeyframe[] = [],
): TransformChannel[] {
  const source = channels && channels.length > 0 ? channels : migrateTransformKeyframesToChannels(object.id, keyframes);
  const byTarget = new Map(source.map((channel) => [`${channel.property}:${channel.axis}`, channel]));
  return emptyTransformChannels(object.id).map((fallback) => {
    const existing = byTarget.get(`${fallback.property}:${fallback.axis}`);
    if (!existing) return fallback;
    return {
      ...fallback,
      id: existing.id || fallback.id,
      enabled: existing.enabled !== false,
      keys: [...existing.keys].sort((a, b) => a.time - b.time),
    };
  });
}

export function channelHasKeys(channel: TransformChannel) {
  return channel.enabled && channel.keys.length > 0;
}
