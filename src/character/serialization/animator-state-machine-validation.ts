import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type {
  AnimatorLayer,
  AnimatorStateMachine,
  AnimatorTransition,
} from "../domain/animator-controller";
import { CharacterCodecError } from "./character-codec-values";

/** Validates recursive ownership and references after the bounded decode pass. */
export function validateAnimatorLayerStateMachines(
  layer: AnimatorLayer,
  parameterIds: ReadonlySet<string>,
): void {
  const stateIds = new Set<string>();
  const machineIds = new Set<string>();
  const transitionIds = new Set<string>();
  const active = new WeakSet<object>();
  const validateMachine = (
    machine: AnimatorLayer | AnimatorStateMachine,
    path: string,
    parent: AnimatorLayer | AnimatorStateMachine | null,
    depth: number,
  ): void => {
    if (depth > ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth || active.has(machine)) {
      throw new CharacterCodecError("invalid-topology", path, "invalid state-machine depth or cycle");
    }
    active.add(machine);
    const directStateIds = new Set(machine.states.map((state) => state.id));
    const children = machine.stateMachines ?? [];
    const directMachineIds = new Set(children.map((child) => child.id));
    for (const state of machine.states) {
      assertUniqueNodeId(state.id, stateIds, machineIds, `${path}.states`);
      stateIds.add(state.id);
    }
    for (const child of children) {
      assertUniqueNodeId(child.id, machineIds, stateIds, `${path}.stateMachines`);
      machineIds.add(child.id);
    }
    if (machine.defaultStateId
      && !directStateIds.has(machine.defaultStateId)
      && !directMachineIds.has(machine.defaultStateId)) throw new CharacterCodecError(
      "invalid-reference",
      `${path}.defaultStateId`,
      "unknown direct state or child state machine",
    );
    const localTransitions = [
      ...machine.anyStateTransitions,
      ...machine.states.flatMap((state) => state.transitions),
    ];
    localTransitions.forEach((transition) => {
      assertUniqueTransitionId(transition.id, transitionIds, path);
      validateTransitionReferences(
        transition,
        directStateIds,
        directMachineIds,
        parameterIds,
      );
    });
    if ("transitions" in machine) {
      const parentStateIds = new Set(parent?.states.map((state) => state.id) ?? []);
      const parentMachineIds = new Set((parent?.stateMachines ?? []).map((child) => child.id));
      machine.transitions.forEach((transition) => {
        assertUniqueTransitionId(transition.id, transitionIds, path);
        validateTransitionReferences(
          transition,
          parentStateIds,
          parentMachineIds,
          parameterIds,
        );
      });
    }
    children.forEach((child, index) => validateMachine(
      child,
      `${path}.stateMachines[${index}]`,
      machine,
      depth + 1,
    ));
    active.delete(machine);
  };
  validateMachine(layer, `layers.${layer.id}`, null, 0);
}

function assertUniqueTransitionId(
  id: string,
  transitionIds: Set<string>,
  path: string,
): void {
  if (!transitionIds.has(id)) {
    transitionIds.add(id);
    return;
  }
  throw new CharacterCodecError("invalid-document", path, `duplicate transition id ${id}`);
}

function assertUniqueNodeId(
  id: string,
  ownIds: ReadonlySet<string>,
  otherIds: ReadonlySet<string>,
  path: string,
): void {
  if (!ownIds.has(id) && !otherIds.has(id)) return;
  throw new CharacterCodecError("invalid-document", path, `duplicate node id ${id}`);
}

function validateTransitionReferences(
  transition: AnimatorTransition,
  stateIds: ReadonlySet<string>,
  machineIds: ReadonlySet<string>,
  parameterIds: ReadonlySet<string>,
): void {
  if (transition.destination.kind === "state" && !stateIds.has(transition.destination.stateId)) {
    throw new CharacterCodecError("invalid-reference", `transitions.${transition.id}.destination`, "unknown state");
  }
  if (transition.destination.kind === "stateMachine"
    && !machineIds.has(transition.destination.stateMachineId)) throw new CharacterCodecError(
    "invalid-reference",
    `transitions.${transition.id}.destination`,
    "unknown state machine",
  );
  for (const condition of transition.conditions) {
    if (!parameterIds.has(condition.parameterId)) throw new CharacterCodecError(
      "invalid-reference",
      `transitions.${transition.id}.conditions`,
      "unknown parameter",
    );
  }
}
