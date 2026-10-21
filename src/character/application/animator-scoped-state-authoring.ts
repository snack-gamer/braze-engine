import type {
  AnimatorController,
  AnimatorState,
} from "../domain/animator-controller";
import type { AnimatorMotion } from "../domain/blend-tree";
import { findAnimatorState } from "../domain/animator-state-machine";
import {
  AnimatorAuthoringError,
  patchAnimatorState,
  removeAnimatorState,
  setAnimatorStateMotion,
} from "./animator-controller-authoring";
import {
  patchAnimatorStateInStateMachine,
  removeAnimatorStateFromStateMachine,
  setAnimatorStateMachineStateMotion,
} from "./animator-state-machine-authoring";

export type AnimatorStatePropertiesPatch = Partial<Pick<AnimatorState,
  | "name"
  | "speed"
  | "speedParameterId"
  | "cycleOffset"
  | "cycleOffsetParameterId"
  | "mirror"
  | "footIk"
  | "writeDefaults">>;

/** Routes state authoring to the root layer or the nested machine that owns it. */
export function patchScopedAnimatorState(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  patch: AnimatorStatePropertiesPatch,
): AnimatorController {
  const ownerMachineId = requiredStateOwnerMachineId(controller, layerId, stateId);
  return ownerMachineId
    ? patchAnimatorStateInStateMachine(controller, layerId, ownerMachineId, stateId, patch)
    : patchAnimatorState(controller, layerId, stateId, patch);
}

export function setScopedAnimatorStateMotion(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  motion: AnimatorMotion | null,
): AnimatorController {
  const ownerMachineId = requiredStateOwnerMachineId(controller, layerId, stateId);
  return ownerMachineId
    ? setAnimatorStateMachineStateMotion(controller, layerId, ownerMachineId, stateId, motion)
    : setAnimatorStateMotion(controller, layerId, stateId, motion);
}

export function removeScopedAnimatorState(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
): AnimatorController {
  const ownerMachineId = requiredStateOwnerMachineId(controller, layerId, stateId);
  return ownerMachineId
    ? removeAnimatorStateFromStateMachine(controller, layerId, ownerMachineId, stateId)
    : removeAnimatorState(controller, layerId, stateId);
}

function requiredStateOwnerMachineId(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
): string | undefined {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  const location = findAnimatorState(layer, stateId);
  if (!location) throw new AnimatorAuthoringError(`Animator state '${stateId}' was not found.`);
  return location.ownerMachineId;
}
