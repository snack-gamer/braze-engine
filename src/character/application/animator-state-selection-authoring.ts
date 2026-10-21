import type { AnimatorController } from "../domain/animator-controller";
import { AnimatorAuthoringError, removeAnimatorState } from "./animator-controller-authoring";

/** Removes one graph selection as a single authored controller update. */
export function removeAnimatorStates(
  controller: AnimatorController,
  layerId: string,
  stateIds: readonly string[],
): AnimatorController {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  const selected = new Set(stateIds);
  if (selected.size === 0) return controller;
  const orderedIds = layer.states
    .filter((state) => selected.has(state.id))
    .map((state) => state.id);
  if (orderedIds.length !== selected.size) {
    throw new AnimatorAuthoringError("Animator selection contains a state that was not found.");
  }
  return orderedIds.reduce(
    (current, stateId) => removeAnimatorState(current, layerId, stateId),
    controller,
  );
}
