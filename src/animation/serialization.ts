import type {
  AnimatedTransform,
  AnimationDocument,
  AnimationTrack,
  MotionClipInstance,
  MotionClipSource,
  TransformAxis,
  TransformChannel,
  TransformChannelKeyframe,
  TransformKeyframe,
  TransformProperty,
} from "./types";
import { clampDuration, clampTime, DEFAULT_ANIMATION_FPS, snapTime } from "./time";
import type { PrimitiveKind } from "../types";
import { ensureTransformChannels, TRANSFORM_AXES, TRANSFORM_PROPERTIES } from "./channels";
import { curveInterpolation } from "./curves";

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function vec3(value: unknown, fallback: [number, number, number]) {
  if (!Array.isArray(value)) return fallback;
  return [
    numberValue(value[0], fallback[0]),
    numberValue(value[1], fallback[1]),
    numberValue(value[2], fallback[2]),
  ] as [number, number, number];
}

function transform(raw: unknown): AnimatedTransform | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  return {
    position: vec3(source.position, [0, 0, 0]),
    rotation: vec3(source.rotation, [0, 0, 0]),
    scale: vec3(source.scale, [1, 1, 1]),
  };
}

function transformKeyframes(raw: unknown[], duration: number, fps: number): TransformKeyframe[] {
  return raw.flatMap((item, index): TransformKeyframe[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const parsedTransform = transform(source.transform);
    if (!parsedTransform) return [];
    return [{
      id: stringValue(source.id, `key-${index}`),
      time: snapTime(clampTime(numberValue(source.time, 0), duration), fps),
      transform: parsedTransform,
      easing: "linear",
    }];
  }).sort((a, b) => a.time - b.time);
}

function transformProperty(value: unknown): TransformProperty | null {
  return TRANSFORM_PROPERTIES.includes(value as TransformProperty) ? (value as TransformProperty) : null;
}

function transformAxis(value: unknown): TransformAxis | null {
  const axis = Math.round(numberValue(value, -1));
  return TRANSFORM_AXES.includes(axis as TransformAxis) ? (axis as TransformAxis) : null;
}

function channelKeys(raw: unknown[], duration: number, fps: number): TransformChannelKeyframe[] {
  return raw.flatMap((item, index): TransformChannelKeyframe[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    return [{
      id: stringValue(source.id, `channel-key-${index}`),
      time: snapTime(clampTime(numberValue(source.time, 0), duration), fps),
      value: numberValue(source.value, 0),
      interpolation: curveInterpolation(source.interpolation),
      inTangent: optionalNumber(source.inTangent),
      outTangent: optionalNumber(source.outTangent),
    }];
  }).sort((a, b) => a.time - b.time);
}

function transformChannels(raw: unknown[], objectId: string, duration: number, fps: number): TransformChannel[] {
  const channels = raw.flatMap((item): TransformChannel[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const property = transformProperty(source.property);
    const axis = transformAxis(source.axis);
    if (!property || axis === null) return [];
    return [{
      id: stringValue(source.id),
      property,
      axis,
      enabled: source.enabled !== false,
      keys: channelKeys(Array.isArray(source.keys) ? source.keys : [], duration, fps),
    }];
  });
  return ensureTransformChannels({ id: objectId }, channels);
}

function motionClips(raw: unknown[], duration: number): MotionClipInstance[] {
  return raw.flatMap((item, index): MotionClipInstance[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const sourceId = stringValue(source.sourceId);
    if (!sourceId) return [];
    const start = clampTime(numberValue(source.start, 0), duration);
    return [{
      id: stringValue(source.id, `clip-${index}`),
      sourceId,
      name: stringValue(source.name, "Motion clip"),
      start,
      duration: Math.max(0.1, numberValue(source.duration, 1)),
      offset: Math.max(0, numberValue(source.offset, 0)),
      weight: Math.min(Math.max(numberValue(source.weight, 1), 0), 1),
      retarget: source.retarget !== false,
    }];
  }).sort((a, b) => a.start - b.start);
}

function primitive(value: unknown): PrimitiveKind {
  return value === "fbx" || value === "gltf" || value === "usdz" || value === "usd" ? value : "fbx";
}

function motionSources(raw: unknown[]): MotionClipSource[] {
  return raw.flatMap((item, index): MotionClipSource[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const id = stringValue(source.id);
    const objectId = stringValue(source.objectId);
    const sourceUrl = stringValue(source.sourceUrl);
    if (!id || !objectId || !sourceUrl) return [];
    return [{
      id,
      objectId,
      sourceUrl,
      sourceType: primitive(source.sourceType),
      name: stringValue(source.name, `Motion ${index + 1}`),
      duration: Math.max(0, numberValue(source.duration, 0)),
      trackCount: Math.max(0, Math.round(numberValue(source.trackCount, 0))),
      clipIndex: Math.max(0, Math.round(numberValue(source.clipIndex, index))),
      retarget: source.retarget !== false,
      assetName: typeof source.assetName === "string" ? source.assetName : undefined,
    }];
  });
}

export function parseAnimationDocument(raw: unknown): AnimationDocument | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const fps = Math.max(1, Math.round(numberValue(source.fps, DEFAULT_ANIMATION_FPS)));
  const duration = clampDuration(numberValue(source.duration, 5));
  const tracks = Array.isArray(source.tracks) ? source.tracks : [];
  return {
    version: 1,
    duration,
    fps,
    playhead: snapTime(clampTime(numberValue(source.playhead, 0), duration), fps),
    loop: source.loop !== false,
    motionSources: motionSources(Array.isArray(source.motionSources) ? source.motionSources : []),
    tracks: tracks.flatMap((item, index): AnimationTrack[] => {
      if (!item || typeof item !== "object") return [];
      const track = item as Record<string, unknown>;
      const kind = track.kind;
      const objectId = stringValue(track.objectId);
      if (!objectId) return [];
      if (kind === "transform") {
        const keyframes = transformKeyframes(Array.isArray(track.keyframes) ? track.keyframes : [], duration, fps);
        const channels = transformChannels(Array.isArray(track.channels) ? track.channels : [], objectId, duration, fps);
        const hasChannelKeys = channels.some((channel) => channel.keys.length > 0);
        return [{
          id: stringValue(track.id, `track-${index}`),
          kind,
          objectId,
          label: stringValue(track.label, "Transform"),
          enabled: track.enabled !== false,
          channels: hasChannelKeys ? channels : ensureTransformChannels({ id: objectId }, undefined, keyframes),
          keyframes: [],
        }];
      }
      if (kind === "motionClip") {
        return [{
          id: stringValue(track.id, `track-${index}`),
          kind,
          objectId,
          label: stringValue(track.label, "Motion"),
          enabled: track.enabled !== false,
          clips: motionClips(Array.isArray(track.clips) ? track.clips : [], duration),
        }];
      }
      return [];
    }),
  };
}

export function serializeAnimationDocument(document: AnimationDocument): AnimationDocument {
  return {
    ...document,
    motionSources: document.motionSources.map((source) => ({ ...source })),
    tracks: document.tracks.map((track) => ({ ...track })),
  };
}
