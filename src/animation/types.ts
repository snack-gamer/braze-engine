import type { PrimitiveKind, SceneObject } from "../types";

export type AnimatedTransform = Pick<SceneObject, "position" | "rotation" | "scale">;
export type TransformProperty = keyof AnimatedTransform;
export type TransformAxis = 0 | 1 | 2;
export type CurveInterpolation =
  | "linear"
  | "step"
  | "smooth"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "manual";

export type TransformKeyframe = {
  id: string;
  time: number;
  transform: AnimatedTransform;
  easing: "linear";
};

export type TransformChannelKeyframe = {
  id: string;
  time: number;
  value: number;
  interpolation: CurveInterpolation;
  inTangent?: number;
  outTangent?: number;
};

export type TransformChannelKeyframeRef = {
  trackId: string;
  channelId: string;
  keyframeId: string;
};

export type TransformChannelKeyframeUpdate = TransformChannelKeyframeRef & {
  time?: number;
  value?: number;
  interpolation?: CurveInterpolation;
  inTangent?: number;
  outTangent?: number;
};

export type TransformChannelKeyframeInsert = {
  trackId: string;
  channelId: string;
  keyframe: TransformChannelKeyframe;
};

export type TransformChannel = {
  id: string;
  property: TransformProperty;
  axis: TransformAxis;
  enabled: boolean;
  keys: TransformChannelKeyframe[];
};

export type TransformChannelTarget = {
  objectId: string;
  property: TransformProperty;
  axis: TransformAxis;
};

export type TransformAnimationTrack = {
  id: string;
  kind: "transform";
  objectId: string;
  label: string;
  enabled: boolean;
  channels: TransformChannel[];
  /** Legacy full-transform keys kept readable for older scene documents. */
  keyframes: TransformKeyframe[];
};

export type MotionClipInstance = {
  id: string;
  sourceId: string;
  name: string;
  start: number;
  duration: number;
  offset: number;
  weight: number;
  retarget: boolean;
};

export type MotionClipTrack = {
  id: string;
  kind: "motionClip";
  objectId: string;
  label: string;
  enabled: boolean;
  clips: MotionClipInstance[];
};

export type MotionClipSource = {
  id: string;
  objectId: string;
  sourceUrl: string;
  sourceType: PrimitiveKind;
  name: string;
  duration: number;
  trackCount: number;
  clipIndex: number;
  retarget: boolean;
  assetName?: string;
};

export type AnimationTrack = TransformAnimationTrack | MotionClipTrack;

export type AnimationDocument = {
  version: 1;
  duration: number;
  fps: number;
  playhead: number;
  loop: boolean;
  motionSources: MotionClipSource[];
  tracks: AnimationTrack[];
};
