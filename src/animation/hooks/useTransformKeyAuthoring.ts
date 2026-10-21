import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import { setTransformValue, transformValue } from "../channels";
import {
  insertTransformChannelKeyframes,
  moveTransformKeyframesAtTime,
  removeTransformChannelKeyframe,
  removeTransformChannelKeyframes,
  setTransformChannelKeyframeTangent,
  setTransformChannelKeyframeValue,
  setTransformKeyframesInterpolationAtTime,
  updateTransformChannelKeyframes,
} from "../transform-key-editing";
import {
  upsertTransformChannelKeyframe,
  upsertTransformKeyframe,
} from "../transform-key-authoring";
import type {
  AnimationDocument,
  CurveInterpolation,
  TransformAxis,
  TransformChannelKeyframeInsert,
  TransformChannelKeyframeRef,
  TransformChannelKeyframeUpdate,
  TransformChannelTarget,
  TransformProperty,
} from "../types";
import type {
  TransformChannelMoveTarget,
  TransformPatch,
} from "./scene-animation-controller";

type TransformKeyAuthoringOptions = {
  objects: SceneObject[];
  activeObject: SceneObject | null;
  animatableIds: ReadonlySet<string>;
  recording: boolean;
  setDocument: Dispatch<SetStateAction<AnimationDocument>>;
  currentPlaybackTime: () => number;
  withTimelineDocument: (document: AnimationDocument) => AnimationDocument;
  evaluatedObjectAtPlayback: (objectId: string) => SceneObject | undefined;
};

/** Owns all authored transform-key mutations exposed by the animation editor. */
export function useTransformKeyAuthoring(options: TransformKeyAuthoringOptions) {
  const {
    objects,
    activeObject,
    animatableIds,
    recording,
    setDocument,
    currentPlaybackTime,
    withTimelineDocument,
    evaluatedObjectAtPlayback,
  } = options;
  const addObjectTransformKeyframe = useCallback((objectId: string) => {
    const source = evaluatedObjectAtPlayback(objectId);
    if (!source || !animatableIds.has(objectId)) return;
    setDocument((current) => upsertTransformKeyframe(
      withTimelineDocument(current),
      source,
      currentPlaybackTime(),
    ));
  }, [animatableIds, currentPlaybackTime, evaluatedObjectAtPlayback, setDocument, withTimelineDocument]);

  const addActiveTransformKeyframe = useCallback(() => {
    if (activeObject) addObjectTransformKeyframe(activeObject.id);
  }, [activeObject, addObjectTransformKeyframe]);

  const addChannelKeyframe = useCallback(({
    objectId,
    property,
    axis,
  }: TransformChannelTarget) => {
    const source = evaluatedObjectAtPlayback(objectId);
    if (!source || !animatableIds.has(objectId)) return;
    setDocument((current) => upsertTransformChannelKeyframe(
      withTimelineDocument(current),
      source,
      property,
      axis,
      currentPlaybackTime(),
    ));
  }, [animatableIds, currentPlaybackTime, evaluatedObjectAtPlayback, setDocument, withTimelineDocument]);

  const addActiveChannelKeyframe = useCallback((
    property: TransformProperty,
    axis: TransformAxis,
  ) => {
    if (activeObject) {
      addChannelKeyframe({ objectId: activeObject.id, property, axis });
    }
  }, [activeObject, addChannelKeyframe]);

  const setChannelValueAtPlayhead = useCallback((
    { objectId, property, axis }: TransformChannelTarget,
    value: number,
  ) => {
    if (!Number.isFinite(value) || !animatableIds.has(objectId)) return;
    const source = evaluatedObjectAtPlayback(objectId);
    if (!source || transformValue(source, property, axis) === value) return;
    const nextSource = { ...source, ...setTransformValue(source, property, axis, value) };
    setDocument((current) => upsertTransformChannelKeyframe(
      withTimelineDocument(current),
      nextSource,
      property,
      axis,
      currentPlaybackTime(),
    ));
  }, [animatableIds, currentPlaybackTime, evaluatedObjectAtPlayback, setDocument, withTimelineDocument]);

  const removeChannelKeyframe = useCallback((
    trackId: string,
    channelId: string,
    keyframeId: string,
  ) => {
    setDocument((current) => removeTransformChannelKeyframe(
      current,
      trackId,
      channelId,
      keyframeId,
    ));
  }, [setDocument]);

  const removeChannelKeyframes = useCallback((refs: TransformChannelKeyframeRef[]) => {
    setDocument((current) => removeTransformChannelKeyframes(
      withTimelineDocument(current),
      refs,
    ));
  }, [setDocument, withTimelineDocument]);

  const insertChannelKeyframes = useCallback((inserts: TransformChannelKeyframeInsert[]) => {
    setDocument((current) => insertTransformChannelKeyframes(
      withTimelineDocument(current),
      inserts,
    ));
  }, [setDocument, withTimelineDocument]);

  const moveKeyframesAtTime = useCallback((
    target: TransformChannelMoveTarget,
    sourceTime: number,
    targetTime: number,
  ) => {
    setDocument((current) => moveTransformKeyframesAtTime(
      withTimelineDocument(current),
      target,
      sourceTime,
      targetTime,
    ));
  }, [setDocument, withTimelineDocument]);

  const setKeyframesInterpolationAtTime = useCallback((
    target: TransformChannelMoveTarget,
    time: number,
    interpolation: CurveInterpolation,
  ) => {
    setDocument((current) => setTransformKeyframesInterpolationAtTime(
      withTimelineDocument(current),
      target,
      time,
      interpolation,
    ));
  }, [setDocument, withTimelineDocument]);

  const setChannelKeyframeValue = useCallback((
    trackId: string,
    channelId: string,
    keyframeId: string,
    value: number,
  ) => {
    setDocument((current) => setTransformChannelKeyframeValue(
      withTimelineDocument(current),
      trackId,
      channelId,
      keyframeId,
      value,
    ));
  }, [setDocument, withTimelineDocument]);

  const updateChannelKeyframes = useCallback((updates: TransformChannelKeyframeUpdate[]) => {
    setDocument((current) => updateTransformChannelKeyframes(
      withTimelineDocument(current),
      updates,
    ));
  }, [setDocument, withTimelineDocument]);

  const setChannelKeyframeTangent = useCallback((
    trackId: string,
    channelId: string,
    keyframeId: string,
    side: "in" | "out",
    tangent: number,
  ) => {
    setDocument((current) => setTransformChannelKeyframeTangent(
      withTimelineDocument(current),
      trackId,
      channelId,
      keyframeId,
      side,
      tangent,
    ));
  }, [setDocument, withTimelineDocument]);

  const recordTransformEdit = useCallback((objectId: string, transform: TransformPatch) => {
    if (!recording || !animatableIds.has(objectId)) return;
    setDocument((current) => {
      const object = objects.find((item) => item.id === objectId);
      if (!object) return current;
      return upsertTransformKeyframe(
        withTimelineDocument(current),
        { ...object, ...transform },
        currentPlaybackTime(),
      );
    });
  }, [animatableIds, currentPlaybackTime, objects, recording, setDocument, withTimelineDocument]);

  return {
    addActiveTransformKeyframe,
    addObjectTransformKeyframe,
    addActiveChannelKeyframe,
    addChannelKeyframe,
    setChannelValueAtPlayhead,
    removeChannelKeyframe,
    removeChannelKeyframes,
    insertChannelKeyframes,
    moveKeyframesAtTime,
    setKeyframesInterpolationAtTime,
    setChannelKeyframeValue,
    updateChannelKeyframes,
    setChannelKeyframeTangent,
    recordTransformEdit,
  };
}
