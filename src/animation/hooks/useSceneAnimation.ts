import { useEffect } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { PrimeTimelineController } from "../../timeline/usePrimeTimeline";
import { useAnimationDocumentSession } from "./useAnimationDocumentSession";
import { useAnimationMotionAuthoring } from "./useAnimationMotionAuthoring";
import { useAnimationTransformProjection } from "./useAnimationTransformProjection";
import type { SceneAnimationController } from "./scene-animation-controller";
import { useTransformKeyAuthoring } from "./useTransformKeyAuthoring";

export type { SceneAnimationController } from "./scene-animation-controller";

type UseSceneAnimationOptions = {
  objects: SceneObject[];
  activeObjectId: string;
  enabled: boolean;
  timeline: PrimeTimelineController;
};

/** Thin composition root for authored animation, projection, and playback. */
export function useSceneAnimation({
  objects,
  activeObjectId,
  enabled,
  timeline,
}: UseSceneAnimationOptions): SceneAnimationController {
  const session = useAnimationDocumentSession({ timeline });
  const projection = useAnimationTransformProjection({
    objects,
    activeObjectId,
    enabled,
    document: session.document,
    displayPlayhead: session.displayPlayhead,
    currentPlaybackTime: session.currentPlaybackTime,
  });

  const transformAuthoring = useTransformKeyAuthoring({
    objects,
    activeObject: projection.activeObject,
    animatableIds: projection.animatableIds,
    recording: session.recording,
    setDocument: session.setDocument,
    currentPlaybackTime: session.currentPlaybackTime,
    withTimelineDocument: session.withTimelineDocument,
    evaluatedObjectAtPlayback: projection.evaluatedObjectAtPlayback,
  });
  const motionAuthoring = useAnimationMotionAuthoring({
    activeObject: projection.activeObject,
    activeObjectId,
    document: session.document,
    setDocument: session.setDocument,
    withTimelineDocument: session.withTimelineDocument,
  });

  useEffect(() => {
    if (!enabled) session.disable();
  }, [enabled, session.disable]);

  useEffect(() => {
    if (!projection.animationPlayerRoot) session.stopRecording();
  }, [projection.animationPlayerRoot, session.stopRecording]);

  return {
    document: session.document,
    serializedDocument: session.serializedDocument,
    playback: session.playback,
    displayPlayhead: session.displayPlayhead,
    playing: session.playing,
    recording: session.recording,
    evaluatedObjects: projection.evaluatedObjects,
    activeObject: projection.activeObject,
    activeEvaluatedObject: projection.activeEvaluatedObject,
    animationPlayerRoot: projection.animationPlayerRoot,
    animatableRows: projection.animatableRows,
    activeTrack: projection.activeTrack,
    activeMotionTrack: projection.activeMotionTrack,
    transformTracks: projection.transformTracks,
    motionClipSources: motionAuthoring.motionClipSources,
    motionImporting: motionAuthoring.motionImporting,
    motionImportError: motionAuthoring.motionImportError,
    setPlayhead: session.setPlayhead,
    setDuration: session.setDuration,
    toggleLoop: session.toggleLoop,
    pausePlayback: session.pausePlayback,
    togglePlayback: session.togglePlayback,
    toggleRecording: session.toggleRecording,
    addActiveTransformKeyframe: transformAuthoring.addActiveTransformKeyframe,
    addObjectTransformKeyframe: transformAuthoring.addObjectTransformKeyframe,
    addActiveChannelKeyframe: transformAuthoring.addActiveChannelKeyframe,
    addChannelKeyframe: transformAuthoring.addChannelKeyframe,
    setChannelValueAtPlayhead: transformAuthoring.setChannelValueAtPlayhead,
    moveKeyframesAtTime: transformAuthoring.moveKeyframesAtTime,
    setKeyframesInterpolationAtTime: transformAuthoring.setKeyframesInterpolationAtTime,
    setChannelKeyframeValue: transformAuthoring.setChannelKeyframeValue,
    updateChannelKeyframes: transformAuthoring.updateChannelKeyframes,
    setChannelKeyframeTangent: transformAuthoring.setChannelKeyframeTangent,
    addMotionClip: motionAuthoring.addMotionClip,
    removeChannelKeyframe: transformAuthoring.removeChannelKeyframe,
    removeChannelKeyframes: transformAuthoring.removeChannelKeyframes,
    insertChannelKeyframes: transformAuthoring.insertChannelKeyframes,
    removeMotionClip: motionAuthoring.removeMotionClip,
    updateMotionClip: motionAuthoring.updateMotionClip,
    registerMotionClips: motionAuthoring.registerMotionClips,
    importMotionFiles: motionAuthoring.importMotionFiles,
    loadDocument: session.loadDocument,
    recordTransformEdit: transformAuthoring.recordTransformEdit,
    subscribePlaybackFrame: session.subscribePlaybackFrame,
  };
}
