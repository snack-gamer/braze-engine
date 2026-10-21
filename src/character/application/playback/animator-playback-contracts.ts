import type { AnimatorComponent, RootMotionPolicy } from "../../domain/animator-component";
import type { AnimationEvent, AnimationClipAsset } from "../../domain/animation-clip";
import type { AnimatorController } from "../../domain/animator-controller";
import type { AvatarMaskAsset } from "../../domain/avatar-mask";
import type { HumanoidAvatarDefinition } from "../../domain/humanoid-avatar";
import type { SkeletonDefinition } from "../../domain/skeleton";
import type { CharacterRuntimeDiagnostic, CharacterRuntimeResult } from "../../runtime/diagnostics";
import type { RuntimeAnimatorParameterValue } from "../../runtime/animator-runtime";
import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import type {
  RootMotionDelta,
  RootMotionLoopBoundary,
  RootMotionPose,
  RootMotionSink,
} from "../../runtime/root-motion";
import type { HumanoidIkGoal } from "./animator-playback-ik";

export type AnimatorPlaybackClip<TClip> = Readonly<{
  /** Same canonical `guid:localId` key emitted by the controller compiler. */
  id: string;
  resource: TClip;
  metadata: Pick<AnimationClipAsset, "durationSeconds" | "events"> & {
    looping: boolean;
    rootMotion?: AnimationClipAsset["rootMotion"];
  };
}>;

export type AnimatorPlaybackAssets<TClip> = Readonly<{
  controller: AnimatorController;
  clips: readonly AnimatorPlaybackClip<TClip>[];
  masks: readonly AvatarMaskAsset[];
  avatar?: AnimatorPlaybackAvatar;
}>;

export type AnimatorPlaybackAvatar =
  | Readonly<{
      id: string;
      kind: "generic";
      skeleton: SkeletonDefinition;
      rootBoneId?: SkeletonDefinition["bones"][number]["id"];
      motionRootBoneId?: SkeletonDefinition["bones"][number]["id"];
    }>
  | Readonly<{
      id: string;
      kind: "humanoid";
      skeleton: SkeletonDefinition;
      definition: HumanoidAvatarDefinition;
      rootBoneId?: SkeletonDefinition["bones"][number]["id"];
      motionRootBoneId?: SkeletonDefinition["bones"][number]["id"];
    }>;

export type AnimatorPoseApplication<TClip> = Readonly<{
  plan: LayerBlendPlan;
  clipsById: ReadonlyMap<string, AnimatorPlaybackClip<TClip>>;
  masksById: ReadonlyMap<string, AvatarMaskAsset>;
  avatar?: AnimatorPlaybackAvatar;
  ikGoalsByLayer?: ReadonlyMap<string, readonly HumanoidIkGoal[]>;
}>;

export type AnimatorPoseApplicationResult = Readonly<{
  changed: boolean;
}>;

/** Clockless target adapter. It owns target-specific pose state and resources. */
export type AnimatorPoseApplier<TClip> = {
  isVisible: () => boolean;
  applyPose: (
    application: AnimatorPoseApplication<TClip>,
  ) => CharacterRuntimeResult<AnimatorPoseApplicationResult>;
  /** Runs procedural pose passes after root motion has been sampled and removed. */
  applyPostProcess?: (
    application: AnimatorPoseApplication<TClip>,
  ) => CharacterRuntimeResult<AnimatorPoseApplicationResult>;
  readRootMotionPose?: (
    policy: RootMotionPolicy,
  ) => CharacterRuntimeResult<RootMotionPose | null>;
  readRootMotionLoopBoundary?: (
    policy: RootMotionPolicy,
    previousPlan: LayerBlendPlan,
    currentPlan: LayerBlendPlan,
  ) => CharacterRuntimeResult<RootMotionLoopBoundary | null>;
  removeRootMotionFromPose?: (
    policy: RootMotionPolicy,
  ) => CharacterRuntimeResult<void>;
  restoreAuthoredPose: () => void;
  dispose: () => void;
};

export type AnimatorPlaybackFrame = Readonly<{
  deltaSeconds: number;
  unscaledDeltaSeconds?: number;
}>;

export type AnimatorPlaybackEvent =
  | Readonly<{
      kind: "clip";
      characterId: string;
      layerId: string;
      clipId: string;
      event: AnimationEvent;
    }>
  | Readonly<{
      kind: "state";
      characterId: string;
      layerId: string;
      stateId: string;
      event: AnimationEvent;
    }>;

export type AnimatorPlaybackStep = Readonly<{
  changed: boolean;
  events: readonly AnimatorPlaybackEvent[];
  rootMotion: readonly RootMotionDelta[];
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

export type AnimatorPlaybackSessionInput<TClip> = Readonly<{
  characterId: string;
  component: AnimatorComponent;
  assets: AnimatorPlaybackAssets<TClip>;
  /** Ownership transfers to the session only when session creation succeeds. */
  pose: AnimatorPoseApplier<TClip>;
  rootMotionSink?: RootMotionSink;
  rootMotionObserver?: RootMotionSink;
  fixedStepSeconds?: number;
  maxFixedStepsPerFrame?: number;
  maxEventsPerFrame?: number;
  /** Editor/gameplay launch values applied before the session's initial pose. */
  launchValues?: Readonly<Record<string, RuntimeAnimatorParameterValue>>;
  onEvent?: (event: AnimatorPlaybackEvent) => void;
  ikGoals?: (layerId: string) => readonly HumanoidIkGoal[];
}>;
