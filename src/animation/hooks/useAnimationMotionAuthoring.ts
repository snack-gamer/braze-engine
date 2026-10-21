import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { SceneObject } from "../../scene/domain/scene-object";
import {
  addMotionClipInstance,
  addMotionSources,
  removeMotionClipInstance,
  updateMotionClipInstance,
} from "../motion-document";
import type { AnimationDocument, MotionClipSource } from "../types";
import { useMotionSources } from "./useMotionSources";

type AnimationMotionAuthoringOptions = {
  activeObject: SceneObject | null;
  activeObjectId: string;
  document: AnimationDocument;
  setDocument: Dispatch<SetStateAction<AnimationDocument>>;
  withTimelineDocument: (document: AnimationDocument) => AnimationDocument;
};

/** Owns motion-source discovery and authored clip-track operations. */
export function useAnimationMotionAuthoring({
  activeObject,
  activeObjectId,
  document,
  setDocument,
  withTimelineDocument,
}: AnimationMotionAuthoringOptions) {
  const addSourcesToDocument = useCallback((sources: MotionClipSource[]) => {
    setDocument((current) => addMotionSources(current, sources));
  }, [setDocument]);
  const motionSources = useMotionSources({
    activeObject,
    activeObjectId,
    documentSources: document.motionSources,
    addSourcesToDocument,
  });

  const addMotionClip = useCallback((sourceId: string) => {
    const source = motionSources.motionClipSources.find((item) => item.id === sourceId);
    if (!activeObject || !source) return;
    setDocument((current) => addMotionClipInstance(
      withTimelineDocument(current),
      activeObject,
      source,
    ));
  }, [activeObject, motionSources.motionClipSources, setDocument, withTimelineDocument]);

  const removeMotionClip = useCallback((trackId: string, clipId: string) => {
    setDocument((current) => removeMotionClipInstance(current, trackId, clipId));
  }, [setDocument]);

  const updateMotionClip = useCallback((
    trackId: string,
    clipId: string,
    patch: Parameters<typeof updateMotionClipInstance>[3],
  ) => {
    setDocument((current) => updateMotionClipInstance(
      withTimelineDocument(current),
      trackId,
      clipId,
      patch,
    ));
  }, [setDocument, withTimelineDocument]);

  return { ...motionSources, addMotionClip, removeMotionClip, updateMotionClip };
}
