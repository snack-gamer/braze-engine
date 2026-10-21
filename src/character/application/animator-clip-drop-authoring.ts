import type { AssetRef } from "../../assets/domain/asset-reference";
import { createAuthoredId } from "../../identity/authored-id";
import { animatorStateNodeId } from "../domain/animator-behavior-map";
import type { AnimatorController } from "../domain/animator-controller";
import type { CharacterVector2 } from "../domain/character-values";
import { setAnimatorGraphNodePosition } from "./animator-behavior-map-authoring";
import { addAnimatorState, setAnimatorStateClip } from "./animator-controller-authoring";
import {
  addAnimatorStateToStateMachine,
  setAnimatorStateMachineStateClip,
} from "./animator-state-machine-authoring";
import { uniqueAnimatorStateName } from "./animator-state-naming";
import { animatorStateMachineScope } from "../domain/animator-state-machine";

export type AnimatorClipStatePlacement = Readonly<{
  clipRef: AssetRef;
  name: string;
  position: CharacterVector2;
  stateId?: string;
}>;

export type AnimatorClipStatePlacementResult = Readonly<{
  controller: AnimatorController;
  stateId: string;
}>;

/** Adds one positioned Clip state while leaving Entry and all transitions untouched. */
export function addAnimatorClipStateAtPosition(
  controller: AnimatorController,
  layerId: string,
  placement: AnimatorClipStatePlacement,
  stateMachineId?: string,
): AnimatorClipStatePlacementResult {
  const stateId = placement.stateId ?? createAuthoredId("animator-state");
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  const scope = layer ? animatorStateMachineScope(layer, stateMachineId) : undefined;
  const name = uniqueAnimatorStateName(scope?.states ?? [], placement.name);
  let next = stateMachineId
    ? addAnimatorStateToStateMachine(controller, layerId, stateMachineId, {
        id: stateId,
        name,
        makeDefault: false,
      })
    : addAnimatorState(controller, layerId, { id: stateId, name, makeDefault: false });
  next = stateMachineId
    ? setAnimatorStateMachineStateClip(next, layerId, stateMachineId, stateId, placement.clipRef)
    : setAnimatorStateClip(next, layerId, stateId, placement.clipRef);
  next = setAnimatorGraphNodePosition(
    next,
    layerId,
    animatorStateNodeId(stateId),
    placement.position,
    stateMachineId,
  );
  return { controller: next, stateId };
}
