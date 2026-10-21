import type { AnimatorController, AnimatorState } from "../domain/animator-controller";
import type { AnimatorClipMotion } from "../domain/blend-tree";
import {
  AnimatorAuthoringError,
} from "./animator-controller-authoring";
import { findAnimatorState } from "../domain/animator-state-machine";
import {
  patchScopedAnimatorState,
  setScopedAnimatorStateMotion,
} from "./animator-scoped-state-authoring";

export type AnimatorClipPlaybackSettings = Readonly<{
  speed: number;
  speedParameterId?: string;
}>;

/** Presents the two legacy timing multipliers as one coherent Clip setting. */
export function animatorClipPlaybackSettings(state: AnimatorState): AnimatorClipPlaybackSettings {
  if (state.motion?.kind !== "clip") {
    throw new AnimatorAuthoringError(`Animator state '${state.id}' does not contain a clip motion.`);
  }
  const combinedSpeed = state.speed * state.motion.speed;
  return {
    speed: Number.isFinite(combinedSpeed) ? combinedSpeed : 1,
    speedParameterId: state.speedParameterId ?? state.motion.timeScaleParameterId,
  };
}

/** Consolidates root-Clip speed authoring onto the state clock used by transitions. */
export function patchAnimatorClipPlayback(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  patch: Readonly<{
    speed?: number;
    speedParameterId?: string;
    loopMode?: AnimatorClipMotion["loopMode"];
  }>,
): AnimatorController {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  const state = layer ? findAnimatorState(layer, stateId)?.state : undefined;
  if (!state || state.motion?.kind !== "clip") {
    throw new AnimatorAuthoringError(`Animator state '${stateId}' does not contain a clip motion.`);
  }
  const current = animatorClipPlaybackSettings(state);
  const speed = patch.speed ?? current.speed;
  if (!Number.isFinite(speed)) throw new AnimatorAuthoringError("Clip speed must be finite.");

  const motion: AnimatorClipMotion = {
    ...state.motion,
    speed: 1,
    timeScaleParameterId: undefined,
    loopMode: "loopMode" in patch ? patch.loopMode : state.motion.loopMode,
  };
  const withMotion = setScopedAnimatorStateMotion(controller, layerId, stateId, motion);
  return patchScopedAnimatorState(withMotion, layerId, stateId, {
    speed,
    speedParameterId: "speedParameterId" in patch
      ? patch.speedParameterId
      : current.speedParameterId,
  });
}
