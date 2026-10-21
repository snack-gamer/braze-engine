/** Compatibility surface for authored animation document operations. */
export {
  createAnimationDocument,
  findMotionClipTrack,
  findTransformTrack,
  setAnimationDuration,
  setAnimationPlayhead,
} from "./animation-document";
export {
  upsertTransformChannelKeyframe,
  upsertTransformKeyframe,
} from "./transform-key-authoring";
export {
  insertTransformChannelKeyframes,
  moveTransformKeyframesAtTime,
  removeTransformChannelKeyframe,
  removeTransformChannelKeyframes,
  setTransformChannelKeyframeTangent,
  setTransformChannelKeyframeValue,
  setTransformKeyframesInterpolationAtTime,
  updateTransformChannelKeyframes,
} from "./transform-key-editing";
export {
  addMotionClipInstance,
  addMotionSources,
  removeMotionClipInstance,
  updateMotionClipInstance,
} from "./motion-document";
