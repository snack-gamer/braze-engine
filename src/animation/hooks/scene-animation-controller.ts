import type { SceneObject } from "../../scene/domain/scene-object";
import type { AssetAnimationClipInfo } from "../../three/assets";
import type { TimelinePlaybackSource } from "../../timeline/playback-state";
import type { updateMotionClipInstance } from "../motion-document";
import type { AnimatableObjectRow } from "../scope";
import type {
  AnimationDocument,
  CurveInterpolation,
  MotionClipSource,
  MotionClipTrack,
  TransformAnimationTrack,
  TransformAxis,
  TransformChannelKeyframeInsert,
  TransformChannelKeyframeRef,
  TransformChannelKeyframeUpdate,
  TransformChannelTarget,
  TransformProperty,
} from "../types";

export type TransformPatch = Pick<SceneObject, "position" | "rotation" | "scale">;

export type TransformChannelMoveTarget = {
  objectId: string;
  property?: TransformProperty;
  axis?: TransformAxis;
};

export type PlaybackFrameListener = (playhead: number) => void;

export type SceneAnimationController = {
  document: AnimationDocument;
  serializedDocument: AnimationDocument;
  playback: TimelinePlaybackSource;
  displayPlayhead: number;
  playing: boolean;
  recording: boolean;
  evaluatedObjects: SceneObject[];
  activeObject: SceneObject | null;
  activeEvaluatedObject: SceneObject | null;
  animationPlayerRoot: SceneObject | null;
  animatableRows: AnimatableObjectRow[];
  activeTrack: TransformAnimationTrack | null;
  activeMotionTrack: MotionClipTrack | null;
  transformTracks: TransformAnimationTrack[];
  motionClipSources: MotionClipSource[];
  motionImporting: boolean;
  motionImportError: string;
  setPlayhead: (time: number) => void;
  setDuration: (duration: number) => void;
  toggleLoop: () => void;
  pausePlayback: () => void;
  togglePlayback: () => void;
  toggleRecording: () => void;
  addActiveTransformKeyframe: () => void;
  addObjectTransformKeyframe: (objectId: string) => void;
  addActiveChannelKeyframe: (property: TransformProperty, axis: TransformAxis) => void;
  addChannelKeyframe: (target: TransformChannelTarget) => void;
  setChannelValueAtPlayhead: (target: TransformChannelTarget, value: number) => void;
  moveKeyframesAtTime: (
    target: TransformChannelMoveTarget,
    sourceTime: number,
    targetTime: number,
  ) => void;
  setKeyframesInterpolationAtTime: (
    target: TransformChannelMoveTarget,
    time: number,
    interpolation: CurveInterpolation,
  ) => void;
  setChannelKeyframeValue: (
    trackId: string,
    channelId: string,
    keyframeId: string,
    value: number,
  ) => void;
  updateChannelKeyframes: (updates: TransformChannelKeyframeUpdate[]) => void;
  setChannelKeyframeTangent: (
    trackId: string,
    channelId: string,
    keyframeId: string,
    side: "in" | "out",
    tangent: number,
  ) => void;
  addMotionClip: (sourceId: string) => void;
  removeChannelKeyframe: (trackId: string, channelId: string, keyframeId: string) => void;
  removeChannelKeyframes: (refs: TransformChannelKeyframeRef[]) => void;
  insertChannelKeyframes: (inserts: TransformChannelKeyframeInsert[]) => void;
  removeMotionClip: (trackId: string, clipId: string) => void;
  updateMotionClip: (
    trackId: string,
    clipId: string,
    patch: Parameters<typeof updateMotionClipInstance>[3],
  ) => void;
  registerMotionClips: (objectId: string, clips: AssetAnimationClipInfo[]) => void;
  importMotionFiles: (files: FileList | null) => Promise<void>;
  loadDocument: (document: AnimationDocument | undefined) => void;
  recordTransformEdit: (objectId: string, transform: TransformPatch) => void;
  subscribePlaybackFrame: (listener: PlaybackFrameListener) => () => void;
};
