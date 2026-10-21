import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  animationPlanObjectIds,
  createAnimationEvaluationPlan,
  evaluateAnimationPlanTargets,
} from "../../animation/evaluate";
import type { AnimationDocument } from "../../animation/types";
import type { PrimeTimelineSample } from "../../timeline/types";
import type { SceneObject, ScenePlaybackMode } from "../../types";
import { syncMotionClipAnimation } from "../animation";
import { findBody } from "../reconcile";
import { markSceneDirty, type Runtime } from "../runtime";
import { applyTransform } from "../transform";

type TimelineFrameSubscription = (listener: (sample: PrimeTimelineSample) => void) => () => void;

type Args = {
  runtimeRef: MutableRefObject<Runtime | null>;
  objects: SceneObject[];
  scenePlaybackMode: ScenePlaybackMode;
  animationDocument?: AnimationDocument;
  subscribeTimelineFrame?: TimelineFrameSubscription;
};

export function useAnimationFrameSync({
  runtimeRef,
  objects,
  scenePlaybackMode,
  animationDocument,
  subscribeTimelineFrame,
}: Args) {
  const evaluationPlan = useMemo(
    () => (animationDocument ? createAnimationEvaluationPlan(objects, animationDocument.tracks) : null),
    [animationDocument, objects],
  );
  const trackedTransformObjects = useMemo(() => {
    if (!evaluationPlan) return [];
    const objectsById = new Map(objects.map((object) => [object.id, object]));
    return animationPlanObjectIds(evaluationPlan)
      .map((id) => objectsById.get(id))
      .filter((object): object is SceneObject => Boolean(object));
  }, [evaluationPlan, objects]);
  const motionObjects = useMemo(() => {
    if (!animationDocument) return [];
    const motionIds = new Set(animationDocument.tracks
      .filter((track) => track.kind === "motionClip" && track.enabled && track.clips.length > 0)
      .map((track) => track.objectId));
    return objects.filter((object) => motionIds.has(object.id));
  }, [animationDocument, objects]);
  const frameStateRef = useRef({ animationDocument, evaluationPlan, trackedTransformObjects, motionObjects });
  const playbackModeRef = useRef(scenePlaybackMode);
  const lastLabelDirtyRef = useRef(0);

  useEffect(() => {
    frameStateRef.current = { animationDocument, evaluationPlan, trackedTransformObjects, motionObjects };
  }, [animationDocument, evaluationPlan, motionObjects, trackedTransformObjects]);

  useEffect(() => {
    playbackModeRef.current = scenePlaybackMode;
  }, [scenePlaybackMode]);

  useEffect(() => {
    if (!subscribeTimelineFrame) return undefined;
    return subscribeTimelineFrame((sample) => {
      const runtime = runtimeRef.current;
      const {
        animationDocument: document,
        evaluationPlan: plan,
        trackedTransformObjects: transformObjects,
        motionObjects: clipObjects,
      } = frameStateRef.current;
      if (!runtime || !document) return;
      if ((!plan || transformObjects.length === 0) && clipObjects.length === 0) return;

      const playhead = sample.time;
      const frameDocument: AnimationDocument = { ...document, playhead };
      const frameObjects = plan ? evaluateAnimationPlanTargets(transformObjects, plan, playhead) : [];
      const playModeActive = playbackModeRef.current !== "edit";
      let changed = false;

      for (const object of frameObjects) {
        if (playModeActive && isDynamicPhysicsObject(object)) continue;
        const node = runtime.objectMap.get(object.id);
        if (!node) continue;
        applyTransform(node, object);
        changed = true;
      }

      for (const object of clipObjects) {
        const node = runtime.objectMap.get(object.id);
        const body = node ? findBody(node) : null;
        if (!body) continue;
        syncMotionClipAnimation(runtime, object, body, frameDocument);
        changed = true;
      }

      const now = performance.now();
      if (runtime.labelRoot.visible && now - lastLabelDirtyRef.current >= 1000 / 24) {
        runtime.labelsDirty = true;
        lastLabelDirtyRef.current = now;
      }
      if (changed) markSceneDirty(runtime);
    });
  }, [runtimeRef, subscribeTimelineFrame]);
}

function isDynamicPhysicsObject(object: SceneObject): boolean {
  return object.rigidbody?.enabled === true && object.rigidbody.bodyType === "dynamic";
}
