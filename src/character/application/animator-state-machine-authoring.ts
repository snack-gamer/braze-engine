import { createAuthoredId } from "../../identity/authored-id";
import type { AssetRef } from "../../assets/domain/asset-reference";
import {
  createAnimatorState,
  type AnimatorController,
  type AnimatorLayer,
  type AnimatorState,
  type AnimatorStateMachine,
} from "../domain/animator-controller";
import type { AnimatorMotion } from "../domain/blend-tree";
import {
  animatorStateMachinesInLayer,
  animatorStatesInLayer,
  findAnimatorStateMachine,
} from "../domain/animator-state-machine";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { AnimatorAuthoringError } from "./animator-controller-authoring";
import { canAddAnimatorState } from "./animator-controller-authoring-limits";
import { reconcileAnimatorSynchronizedLayers } from "./animator-synchronized-layer-authoring";
import {
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../domain/animator-behavior-map";

export function addAnimatorStateMachine(
  controller: AnimatorController,
  layerId: string,
  parentStateMachineId: string | undefined,
  options: Readonly<{ id?: string; name?: string }> = {},
): AnimatorController {
  const layer = requiredMutableLayer(controller, layerId);
  if (animatorStateMachinesInLayer(layer).length >= ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer) {
    throw new AnimatorAuthoringError(
      `Animator layer '${layerId}' cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer} state machines.`,
    );
  }
  const parent = parentStateMachineId
    ? findAnimatorStateMachine(layer, parentStateMachineId)
    : undefined;
  if (parentStateMachineId && !parent) {
    throw new AnimatorAuthoringError(`Animator state machine '${parentStateMachineId}' was not found.`);
  }
  if ((parent?.depth ?? 0) + 1 > ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth) {
    throw new AnimatorAuthoringError(
      `Animator state machines cannot exceed depth ${ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth}.`,
    );
  }
  const id = options.id ?? createAuthoredId("animator-state-machine");
  assertAvailableNodeId(layer, id);
  const machine: AnimatorStateMachine = {
    id,
    name: authoredName(options.name ?? "New State Machine"),
    defaultStateId: "",
    states: [],
    stateMachines: [],
    anyStateTransitions: [],
    transitions: [],
  };
  return updateLayer(controller, layerId, (current) => parentStateMachineId
    ? updateMachine(current, parentStateMachineId, (parent) => ({
        ...parent,
        stateMachines: [...parent.stateMachines, machine],
      }))
    : { ...current, stateMachines: [...(current.stateMachines ?? []), machine] });
}

export function addAnimatorStateToStateMachine(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  options: Readonly<{ id?: string; name?: string; makeDefault?: boolean }> = {},
): AnimatorController {
  const layer = requiredMutableLayer(controller, layerId);
  const location = findAnimatorStateMachine(layer, stateMachineId);
  if (!location) throw new AnimatorAuthoringError(`Animator state machine '${stateMachineId}' was not found.`);
  if (!canAddAnimatorState(layer, stateMachineId)) throw new AnimatorAuthoringError(
    `Animator layer '${layerId}' cannot exceed its state or compiled-transition budget.`,
  );
  const id = options.id ?? createAuthoredId("animator-state");
  assertAvailableNodeId(layer, id);
  const state = createAnimatorState(
    id,
    authoredName(options.name ?? `State ${location.machine.states.length + 1}`),
  );
  return updateLayer(controller, layerId, (current) => updateMachine(
    current,
    stateMachineId,
    (machine) => ({
      ...machine,
      states: [...machine.states, state],
      defaultStateId: options.makeDefault === true
        ? id
        : options.makeDefault === false ? machine.defaultStateId : machine.defaultStateId || id,
    }),
  ));
}

export function patchAnimatorStateInStateMachine(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  stateId: string,
  patch: Partial<Pick<AnimatorState,
    | "name"
    | "speed"
    | "speedParameterId"
    | "cycleOffset"
    | "cycleOffsetParameterId"
    | "mirror"
    | "footIk"
    | "writeDefaults">>,
): AnimatorController {
  requiredLayer(controller, layerId);
  return updateLayer(controller, layerId, (layer) => updateMachineState(
    layer,
    stateMachineId,
    stateId,
    (state) => ({
      ...state,
      ...patch,
      ...(patch.name === undefined ? {} : { name: authoredName(patch.name) }),
      ...(patch.speed === undefined || Number.isFinite(patch.speed) ? {} : { speed: state.speed }),
      ...(patch.cycleOffset === undefined || Number.isFinite(patch.cycleOffset)
        ? {}
        : { cycleOffset: state.cycleOffset }),
    }),
  ));
}

export function setAnimatorStateMachineStateMotion(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  stateId: string,
  motion: AnimatorMotion | null,
): AnimatorController {
  requiredLayer(controller, layerId);
  return updateLayer(controller, layerId, (layer) => updateMachineState(
    layer,
    stateMachineId,
    stateId,
    (state) => ({ ...state, motion }),
  ));
}

export function setAnimatorStateMachineStateClip(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  stateId: string,
  clipRef: AssetRef | null,
): AnimatorController {
  return setAnimatorStateMachineStateMotion(
    controller,
    layerId,
    stateMachineId,
    stateId,
    clipRef ? { kind: "clip", clipRef: { ...clipRef }, speed: 1 } : null,
  );
}

export function removeAnimatorStateFromStateMachine(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  stateId: string,
): AnimatorController {
  requiredMutableLayer(controller, layerId);
  const next = updateLayer(controller, layerId, (layer) => updateMachine(
    layer,
    stateMachineId,
    (machine) => {
      if (!machine.states.some((state) => state.id === stateId)) {
        throw new AnimatorAuthoringError(`Animator state '${stateId}' was not found.`);
      }
      const keepsDestination = (transition: AnimatorState["transitions"][number]) => (
        transition.destination.kind !== "state" || transition.destination.stateId !== stateId
      );
      const states = machine.states
        .filter((state) => state.id !== stateId)
        .map((state) => ({ ...state, transitions: state.transitions.filter(keepsDestination) }));
      return {
        ...machine,
        states,
        defaultStateId: machine.defaultStateId === stateId
          ? states[0]?.id ?? machine.stateMachines[0]?.id ?? ""
          : machine.defaultStateId,
        anyStateTransitions: machine.anyStateTransitions.filter(keepsDestination),
        stateMachines: machine.stateMachines.map((child) => ({
          ...child,
          transitions: child.transitions.filter(keepsDestination),
        })),
      };
    },
  ));
  return pruneGraphLayouts(next, layerId, new Set([animatorStateNodeId(stateId)]));
}

export function setAnimatorStateMachineDefaultNode(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  nodeId: string,
): AnimatorController {
  requiredMutableLayer(controller, layerId);
  return updateLayer(controller, layerId, (layer) => updateMachine(
    layer,
    stateMachineId,
    (machine) => {
      const found = machine.states.some((state) => state.id === nodeId)
        || machine.stateMachines.some((child) => child.id === nodeId);
      if (!found) throw new AnimatorAuthoringError(`Animator node '${nodeId}' was not found.`);
      return { ...machine, defaultStateId: nodeId };
    },
  ));
}

export function patchAnimatorStateMachine(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
  patch: Readonly<{ name?: string }>,
): AnimatorController {
  requiredMutableLayer(controller, layerId);
  return updateLayer(controller, layerId, (layer) => updateMachine(
    layer,
    stateMachineId,
    (machine) => ({
      ...machine,
      ...(patch.name === undefined ? {} : { name: authoredName(patch.name) }),
    }),
  ));
}

export function removeAnimatorStateMachine(
  controller: AnimatorController,
  layerId: string,
  stateMachineId: string,
): AnimatorController {
  const layer = requiredMutableLayer(controller, layerId);
  const location = findAnimatorStateMachine(layer, stateMachineId);
  if (!location) {
    throw new AnimatorAuthoringError(`Animator state machine '${stateMachineId}' was not found.`);
  }
  const removedMachines = animatorStateMachinesInSubtree(location.machine);
  const removedScopeIds = new Set(removedMachines.map((machine) => machine.id));
  const removedNodeIds = new Set([
    ...removedMachines.map((machine) => animatorStateMachineNodeId(machine.id)),
    ...removedMachines.flatMap((machine) => (
      machine.states.map((state) => animatorStateNodeId(state.id))
    )),
  ]);
  const removeNested = (scope: AnimatorStateMachine): AnimatorStateMachine => {
    const stateMachines = (scope.stateMachines ?? [])
      .filter((machine) => machine.id !== stateMachineId)
      .map(removeNested);
    const keepsDestination = (transition: AnimatorState["transitions"][number]) => (
      transition.destination.kind !== "stateMachine"
      || transition.destination.stateMachineId !== stateMachineId
    );
    const directStates = scope.states.map((state) => ({
      ...state,
      transitions: state.transitions.filter(keepsDestination),
    }));
    const defaultStateId = scope.defaultStateId === stateMachineId
      ? directStates[0]?.id ?? stateMachines[0]?.id ?? ""
      : scope.defaultStateId;
    return {
      ...scope,
      defaultStateId,
      states: directStates,
      stateMachines,
      anyStateTransitions: scope.anyStateTransitions.filter(keepsDestination),
      transitions: scope.transitions.filter(keepsDestination),
    };
  };
  const next = updateLayer(controller, layerId, (current) => {
    const stateMachines = (current.stateMachines ?? [])
      .filter((machine) => machine.id !== stateMachineId)
      .map(removeNested);
    const keepsDestination = (transition: AnimatorState["transitions"][number]) => (
      transition.destination.kind !== "stateMachine"
      || transition.destination.stateMachineId !== stateMachineId
    );
    const states = current.states.map((state) => ({
      ...state,
      transitions: state.transitions.filter(keepsDestination),
    }));
    return {
      ...current,
      states,
      stateMachines,
      defaultStateId: current.defaultStateId === stateMachineId
        ? states[0]?.id ?? stateMachines[0]?.id ?? ""
        : current.defaultStateId,
      anyStateTransitions: current.anyStateTransitions.filter(keepsDestination),
    };
  });
  return pruneGraphLayouts(next, layerId, removedNodeIds, removedScopeIds);
}

function animatorStateMachinesInSubtree(root: AnimatorStateMachine): AnimatorStateMachine[] {
  const machines: AnimatorStateMachine[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const machine = pending.shift()!;
    machines.push(machine);
    pending.push(...machine.stateMachines);
  }
  return machines;
}

function pruneGraphLayouts(
  controller: AnimatorController,
  layerId: string,
  nodeIds: ReadonlySet<string>,
  stateMachineIds: ReadonlySet<string> = new Set(),
): AnimatorController {
  if (!controller.behaviorMap) return controller;
  return {
    ...controller,
    behaviorMap: {
      ...controller.behaviorMap,
      layers: controller.behaviorMap.layers.map((layer) => layer.layerId === layerId
        ? {
            ...layer,
            nodes: layer.nodes.filter((node) => (
              !nodeIds.has(node.id)
              && (!node.stateMachineId || !stateMachineIds.has(node.stateMachineId))
            )),
          }
        : layer),
    },
  };
}

function updateLayer(
  controller: AnimatorController,
  layerId: string,
  update: (layer: AnimatorLayer) => AnimatorLayer,
): AnimatorController {
  const next = {
    ...controller,
    layers: controller.layers.map((layer) => layer.id === layerId ? update(layer) : layer),
  };
  return reconcileAnimatorSynchronizedLayers(next, layerId);
}

function updateMachine(
  layer: AnimatorLayer,
  stateMachineId: string,
  update: (machine: AnimatorStateMachine) => AnimatorStateMachine,
): AnimatorLayer {
  let found = false;
  const map = (machine: AnimatorStateMachine): AnimatorStateMachine => {
    if (machine.id === stateMachineId) {
      found = true;
      return update(machine);
    }
    return { ...machine, stateMachines: machine.stateMachines.map(map) };
  };
  const stateMachines = (layer.stateMachines ?? []).map(map);
  if (!found) throw new AnimatorAuthoringError(`Animator state machine '${stateMachineId}' was not found.`);
  return { ...layer, stateMachines };
}

function updateMachineState(
  layer: AnimatorLayer,
  stateMachineId: string,
  stateId: string,
  update: (state: AnimatorState) => AnimatorState,
): AnimatorLayer {
  return updateMachine(layer, stateMachineId, (machine) => {
    let found = false;
    const states = machine.states.map((state) => {
      if (state.id !== stateId) return state;
      found = true;
      return update(state);
    });
    if (!found) throw new AnimatorAuthoringError(`Animator state '${stateId}' was not found.`);
    return { ...machine, states };
  });
}

function requiredMutableLayer(controller: AnimatorController, layerId: string): AnimatorLayer {
  const layer = requiredLayer(controller, layerId);
  if (layer.syncedLayerId) throw new AnimatorAuthoringError(
    "Synchronized layers inherit their state machine from the source layer.",
  );
  return layer;
}

function requiredLayer(controller: AnimatorController, layerId: string): AnimatorLayer {
  const layer = controller.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  return layer;
}

function assertAvailableNodeId(layer: AnimatorLayer, id: string): void {
  const exists = animatorStatesInLayer(layer).some((state) => state.id === id)
    || animatorStateMachinesInLayer(layer).some((machine) => machine.id === id);
  if (exists) throw new AnimatorAuthoringError(`Animator node '${id}' already exists.`);
}

function authoredName(value: string): string {
  const name = value.trim();
  if (!name) throw new AnimatorAuthoringError("Animator state-machine name cannot be empty.");
  return name;
}
