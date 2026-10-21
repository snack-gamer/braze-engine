import { useMemo, type ReactNode } from "react";
import type { AnimatedTransformChannels } from "../../components/scene/SceneInspector";
import type { TimelinePlaybackSource } from "../../timeline/playback-state";
import { useTimelinePlaybackSnapshot } from "../../timeline/useTimelinePlaybackSnapshot";
import type { SceneObject } from "../../types";
import { animatedTransformChannelsForTrack } from "../animated-transform-channels";
import { createAnimationEvaluationPlan } from "../evaluate";
import { evaluateObjectAtPlayback } from "../playback-evaluation";
import type { AnimationDocument, TransformAnimationTrack } from "../types";

type InspectorAnimationProjection = {
  activeObject: SceneObject;
  objects: SceneObject[];
  animatedTransformChannels: AnimatedTransformChannels;
};

type SelectedObjectAnimationProjectionProps = {
  objects: SceneObject[];
  activeObjectId: string;
  animationDocument: AnimationDocument;
  playback: TimelinePlaybackSource;
  active: boolean;
  children: (projection: InspectorAnimationProjection) => ReactNode;
};

/** Keeps live selected-object animation inside the Inspector subtree. */
export function SelectedObjectAnimationProjection({
  objects,
  activeObjectId,
  animationDocument,
  playback,
  active,
  children,
}: SelectedObjectAnimationProjectionProps) {
  const sourceObject = useMemo(
    () => objects.find((object) => object.id === activeObjectId) ?? null,
    [activeObjectId, objects],
  );
  const plan = useMemo(
    () => createAnimationEvaluationPlan(objects, animationDocument.tracks),
    [animationDocument.tracks, objects],
  );
  const selectedTrack = plan.tracks.has(activeObjectId);
  const playbackSample = useTimelinePlaybackSnapshot(playback, active && selectedTrack);
  const activeObject = useMemo(() => {
    if (!sourceObject || !selectedTrack) return sourceObject;
    return evaluateObjectAtPlayback(sourceObject, plan, playbackSample.time) ?? sourceObject;
  }, [plan, playbackSample.time, selectedTrack, sourceObject]);
  const transformTrack = animationDocument.tracks.find(
    (track): track is TransformAnimationTrack => track.kind === "transform" && track.objectId === activeObjectId,
  );
  const animatedTransformChannels = useMemo(
    () => animatedTransformChannelsForTrack(transformTrack),
    [transformTrack],
  );

  if (!activeObject) return null;
  return children({ activeObject, objects, animatedTransformChannels });
}
