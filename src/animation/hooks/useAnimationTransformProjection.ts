import { useCallback, useMemo } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import { findMotionClipTrack, findTransformTrack } from "../animation-document";
import { createAnimationEvaluationPlan, evaluateAnimationPlan } from "../evaluate";
import { evaluateObjectAtPlayback } from "../playback-evaluation";
import { animationPlayerSubtree, findAnimationPlayerRoot } from "../scope";
import type { AnimationDocument, TransformAnimationTrack } from "../types";

type AnimationTransformProjectionOptions = {
  objects: SceneObject[];
  activeObjectId: string;
  enabled: boolean;
  document: AnimationDocument;
  displayPlayhead: number;
  currentPlaybackTime: () => number;
};

/** Derives editor scope and transform projection without owning authored state. */
export function useAnimationTransformProjection({
  objects,
  activeObjectId,
  enabled,
  document,
  displayPlayhead,
  currentPlaybackTime,
}: AnimationTransformProjectionOptions) {
  const activeObject = useMemo(
    () => objects.find((object) => object.id === activeObjectId) ?? null,
    [activeObjectId, objects],
  );
  const animationPlayerRoot = useMemo(
    () => findAnimationPlayerRoot(objects, activeObjectId),
    [activeObjectId, objects],
  );
  const animatableRows = useMemo(
    () => animationPlayerSubtree(objects, animationPlayerRoot?.id ?? null),
    [animationPlayerRoot?.id, objects],
  );
  const animatableIds = useMemo(
    () => new Set(animatableRows.map((row) => row.object.id)),
    [animatableRows],
  );
  const transformTracks = useMemo(
    () => document.tracks.filter(
      (track): track is TransformAnimationTrack => track.kind === "transform",
    ),
    [document.tracks],
  );
  const evaluationPlan = useMemo(
    () => enabled ? createAnimationEvaluationPlan(objects, document.tracks) : null,
    [document.tracks, enabled, objects],
  );
  const evaluatedObjects = useMemo(
    () => enabled && evaluationPlan
      ? evaluateAnimationPlan(objects, evaluationPlan, displayPlayhead)
      : objects,
    [displayPlayhead, enabled, evaluationPlan, objects],
  );
  const evaluatedObjectAtPlayback = useCallback((objectId: string) => {
    const source = objects.find((object) => object.id === objectId);
    if (!enabled || !evaluationPlan) return source;
    return evaluateObjectAtPlayback(source, evaluationPlan, currentPlaybackTime());
  }, [currentPlaybackTime, enabled, evaluationPlan, objects]);
  const activeEvaluatedObject = useMemo(
    () => evaluatedObjects.find((object) => object.id === activeObjectId) ?? activeObject,
    [activeObject, activeObjectId, evaluatedObjects],
  );
  const activeTrack = useMemo(
    () => findTransformTrack(document, activeObjectId) ?? null,
    [activeObjectId, document],
  );
  const activeMotionTrack = useMemo(
    () => findMotionClipTrack(document, activeObjectId) ?? null,
    [activeObjectId, document],
  );

  return {
    activeObject,
    animationPlayerRoot,
    animatableRows,
    animatableIds,
    transformTracks,
    evaluatedObjects,
    evaluatedObjectAtPlayback,
    activeEvaluatedObject,
    activeTrack,
    activeMotionTrack,
  };
}
