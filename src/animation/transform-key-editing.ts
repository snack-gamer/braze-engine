import { ensureTransformChannels } from "./channels";
import { clampTime, frameEpsilon, snapTime } from "./time";
import type {
  AnimationDocument,
  CurveInterpolation,
  TransformAxis,
  TransformChannelKeyframe,
  TransformChannelKeyframeInsert,
  TransformChannelKeyframeRef,
  TransformChannelKeyframeUpdate,
  TransformProperty,
} from "./types";

type TransformKeyframeTarget = {
  objectId: string;
  property?: TransformProperty;
  axis?: TransformAxis;
};

function transformKeyRefId(trackId: string, channelId: string, keyframeId: string) {
  return `${trackId}:${channelId}:${keyframeId}`;
}

function hasTransformKeys(track: AnimationDocument["tracks"][number]): boolean {
  if (track.kind !== "transform") return true;
  return track.keyframes.length > 0 || track.channels.some((channel) => channel.keys.length > 0);
}

export function removeTransformChannelKeyframe(
  document: AnimationDocument,
  trackId: string,
  channelId: string,
  keyframeId: string,
): AnimationDocument {
  return {
    ...document,
    tracks: document.tracks
      .map((track) => {
        if (track.id !== trackId || track.kind !== "transform") return track;
        return {
          ...track,
          channels: track.channels.map((channel) => channel.id === channelId
            ? { ...channel, keys: channel.keys.filter((keyframe) => keyframe.id !== keyframeId) }
            : channel),
        };
      })
      .filter(hasTransformKeys),
  };
}

function moveChannelKeysAtTime(
  keys: TransformChannelKeyframe[],
  sourceTime: number,
  targetTime: number,
  fps: number,
): TransformChannelKeyframe[] {
  const epsilon = frameEpsilon(fps);
  let moved = false;
  const movedIds = new Set<string>();
  const remapped = keys.map((key) => {
    if (Math.abs(key.time - sourceTime) > epsilon) return key;
    moved = true;
    movedIds.add(key.id);
    return { ...key, time: targetTime };
  });
  if (!moved) return keys;

  const merged: TransformChannelKeyframe[] = [];
  for (const key of remapped) {
    const existingIndex = merged.findIndex((item) => Math.abs(item.time - key.time) <= epsilon);
    if (existingIndex < 0) {
      merged.push(key);
      continue;
    }
    if (movedIds.has(key.id) || !movedIds.has(merged[existingIndex].id)) {
      merged[existingIndex] = key;
    }
  }
  return merged.sort((left, right) => left.time - right.time);
}

function mergeChannelKeysByTime(
  keys: TransformChannelKeyframe[],
  fps: number,
  preferredIds: Set<string>,
): TransformChannelKeyframe[] {
  const epsilon = frameEpsilon(fps);
  const merged: TransformChannelKeyframe[] = [];
  for (const key of keys) {
    const existingIndex = merged.findIndex((item) => Math.abs(item.time - key.time) <= epsilon);
    if (existingIndex < 0) {
      merged.push(key);
      continue;
    }
    const existing = merged[existingIndex];
    if (preferredIds.has(key.id) || !preferredIds.has(existing.id)) merged[existingIndex] = key;
  }
  return merged.sort((left, right) => left.time - right.time);
}

export function moveTransformKeyframesAtTime(
  document: AnimationDocument,
  target: TransformKeyframeTarget,
  sourceTime: number,
  targetTime: number,
): AnimationDocument {
  const from = snapTime(clampTime(sourceTime, document.duration), document.fps);
  const to = snapTime(clampTime(targetTime, document.duration), document.fps);
  if (from === to) return document;
  let changed = false;
  const tracks = document.tracks.map((track) => {
    if (track.kind !== "transform" || track.objectId !== target.objectId) return track;
    let trackChanged = false;
    const channels = ensureTransformChannels({ id: track.objectId }, track.channels, track.keyframes)
      .map((channel) => {
        if (target.property && channel.property !== target.property) return channel;
        if (target.axis !== undefined && channel.axis !== target.axis) return channel;
        const keys = moveChannelKeysAtTime(channel.keys, from, to, document.fps);
        if (keys === channel.keys) return channel;
        trackChanged = true;
        changed = true;
        return { ...channel, keys };
      });
    return trackChanged ? { ...track, channels, keyframes: [] } : track;
  });
  return changed ? { ...document, tracks } : document;
}

export function updateTransformChannelKeyframes(
  document: AnimationDocument,
  updates: TransformChannelKeyframeUpdate[],
): AnimationDocument {
  if (updates.length === 0) return document;
  const updateById = new Map(
    updates.map((update) => [
      transformKeyRefId(update.trackId, update.channelId, update.keyframeId),
      update,
    ]),
  );
  let changed = false;
  const tracks = document.tracks.map((track) => {
    if (track.kind !== "transform") return track;
    let trackChanged = false;
    const channels = track.channels.map((channel) => {
      let channelChanged = false;
      const updatedIds = new Set<string>();
      const keys = channel.keys.map((key) => {
        const update = updateById.get(transformKeyRefId(track.id, channel.id, key.id));
        if (!update) return key;
        const next: TransformChannelKeyframe = { ...key };
        if (update.time !== undefined) {
          next.time = snapTime(clampTime(update.time, document.duration), document.fps);
        }
        if (update.value !== undefined && Number.isFinite(update.value)) next.value = update.value;
        if (update.interpolation !== undefined) next.interpolation = update.interpolation;
        if (update.inTangent !== undefined) next.inTangent = update.inTangent;
        if (update.outTangent !== undefined) next.outTangent = update.outTangent;
        if (
          next.time === key.time
          && next.value === key.value
          && next.interpolation === key.interpolation
          && next.inTangent === key.inTangent
          && next.outTangent === key.outTangent
        ) return key;
        changed = true;
        channelChanged = true;
        trackChanged = true;
        updatedIds.add(key.id);
        return next;
      });
      return channelChanged
        ? { ...channel, keys: mergeChannelKeysByTime(keys, document.fps, updatedIds) }
        : channel;
    });
    return trackChanged ? { ...track, channels, keyframes: [] } : track;
  });
  return changed ? { ...document, tracks } : document;
}

export function removeTransformChannelKeyframes(
  document: AnimationDocument,
  refs: TransformChannelKeyframeRef[],
): AnimationDocument {
  if (refs.length === 0) return document;
  const ids = new Set(refs.map((ref) => (
    transformKeyRefId(ref.trackId, ref.channelId, ref.keyframeId)
  )));
  let changed = false;
  const tracks = document.tracks
    .map((track) => {
      if (track.kind !== "transform") return track;
      let trackChanged = false;
      const channels = track.channels.map((channel) => {
        const keys = channel.keys.filter((key) => {
          const keep = !ids.has(transformKeyRefId(track.id, channel.id, key.id));
          if (!keep) {
            changed = true;
            trackChanged = true;
          }
          return keep;
        });
        return keys.length === channel.keys.length ? channel : { ...channel, keys };
      });
      return trackChanged ? { ...track, channels, keyframes: [] } : track;
    })
    .filter(hasTransformKeys);
  return changed ? { ...document, tracks } : document;
}

export function insertTransformChannelKeyframes(
  document: AnimationDocument,
  inserts: TransformChannelKeyframeInsert[],
): AnimationDocument {
  if (inserts.length === 0) return document;
  const insertsByChannel = new Map<string, TransformChannelKeyframe[]>();
  for (const insert of inserts) {
    const key = transformKeyRefId(insert.trackId, insert.channelId, "");
    const nextKeyframe: TransformChannelKeyframe = {
      ...insert.keyframe,
      time: snapTime(clampTime(insert.keyframe.time, document.duration), document.fps),
    };
    insertsByChannel.set(key, [...(insertsByChannel.get(key) ?? []), nextKeyframe]);
  }
  let changed = false;
  const tracks = document.tracks.map((track) => {
    if (track.kind !== "transform") return track;
    let trackChanged = false;
    const channels = track.channels.map((channel) => {
      const channelInserts = insertsByChannel.get(transformKeyRefId(track.id, channel.id, ""));
      if (!channelInserts || channelInserts.length === 0) return channel;
      changed = true;
      trackChanged = true;
      const preferredIds = new Set(channelInserts.map((keyframe) => keyframe.id));
      return {
        ...channel,
        keys: mergeChannelKeysByTime(
          [...channel.keys, ...channelInserts],
          document.fps,
          preferredIds,
        ),
      };
    });
    return trackChanged ? { ...track, channels, keyframes: [] } : track;
  });
  return changed ? { ...document, tracks } : document;
}

export function setTransformKeyframesInterpolationAtTime(
  document: AnimationDocument,
  target: TransformKeyframeTarget,
  time: number,
  interpolation: CurveInterpolation,
): AnimationDocument {
  const at = snapTime(clampTime(time, document.duration), document.fps);
  const epsilon = frameEpsilon(document.fps);
  let changed = false;
  const tracks = document.tracks.map((track) => {
    if (track.kind !== "transform" || track.objectId !== target.objectId) return track;
    let trackChanged = false;
    const channels = ensureTransformChannels({ id: track.objectId }, track.channels, track.keyframes)
      .map((channel) => {
        if (target.property && channel.property !== target.property) return channel;
        if (target.axis !== undefined && channel.axis !== target.axis) return channel;
        let channelChanged = false;
        const keys = channel.keys.map((key) => {
          if (Math.abs(key.time - at) > epsilon || key.interpolation === interpolation) return key;
          channelChanged = true;
          trackChanged = true;
          changed = true;
          return { ...key, interpolation };
        });
        return channelChanged ? { ...channel, keys } : channel;
      });
    return trackChanged ? { ...track, channels, keyframes: [] } : track;
  });
  return changed ? { ...document, tracks } : document;
}

export function setTransformChannelKeyframeValue(
  document: AnimationDocument,
  trackId: string,
  channelId: string,
  keyframeId: string,
  value: number,
): AnimationDocument {
  if (!Number.isFinite(value)) return document;
  return patchTransformChannelKey(
    document,
    trackId,
    channelId,
    keyframeId,
    (key) => key.value === value ? key : { ...key, value },
  );
}

export function setTransformChannelKeyframeTangent(
  document: AnimationDocument,
  trackId: string,
  channelId: string,
  keyframeId: string,
  side: "in" | "out",
  tangent: number,
): AnimationDocument {
  if (!Number.isFinite(tangent)) return document;
  const tangentKey = side === "in" ? "inTangent" : "outTangent";
  return patchTransformChannelKey(document, trackId, channelId, keyframeId, (key) => (
    key[tangentKey] === tangent
      ? key
      : { ...key, interpolation: "manual" as CurveInterpolation, [tangentKey]: tangent }
  ));
}

function patchTransformChannelKey(
  document: AnimationDocument,
  trackId: string,
  channelId: string,
  keyframeId: string,
  patch: (key: TransformChannelKeyframe) => TransformChannelKeyframe,
): AnimationDocument {
  let changed = false;
  const tracks = document.tracks.map((track) => {
    if (track.kind !== "transform" || track.id !== trackId) return track;
    let trackChanged = false;
    const channels = track.channels.map((channel) => {
      if (channel.id !== channelId) return channel;
      let channelChanged = false;
      const keys = channel.keys.map((key) => {
        if (key.id !== keyframeId) return key;
        const next = patch(key);
        if (next === key) return key;
        changed = true;
        channelChanged = true;
        trackChanged = true;
        return next;
      });
      return channelChanged ? { ...channel, keys } : channel;
    });
    return trackChanged ? { ...track, channels, keyframes: [] } : track;
  });
  return changed ? { ...document, tracks } : document;
}
