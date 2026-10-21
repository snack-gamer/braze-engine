import { createAuthoredId } from "../../identity/authored-id";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorStateMachine,
  AnimatorTransition,
  AnimatorTransitionDestination,
} from "../domain/animator-controller";
import {
  animatorStateMachinesInLayer,
  findAnimatorState,
  findAnimatorStateMachine,
  type AnimatorStateMachineScope,
} from "../domain/animator-state-machine";
import { animatorLayerTransitionBudget } from "../domain/animator-transition-budget";
import type { AnimatorCondition, AnimatorParameter } from "../domain/animator-parameters";
import { AnimatorAuthoringError } from "./animator-controller-authoring";
import {
  canAddAnimatorTransition,
  MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION,
  MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER,
} from "./animator-controller-authoring-limits";

export type AnimatorTransitionSource =
  | { kind: "state"; stateId: string }
  | { kind: "stateMachine"; stateMachineId: string }
  | { kind: "anyState"; stateMachineId?: string };

export type AnimatorTransitionPatch = Partial<Omit<AnimatorTransition, "id" | "destination">>;

function updateLayer(
  controller: AnimatorController,
  layerId: string,
  update: (layer: AnimatorLayer) => AnimatorLayer,
): AnimatorController {
  let found = false;
  const layers = controller.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    found = true;
    return update(layer);
  });
  if (!found) throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  return { ...controller, layers };
}

function newTransition(id: string, destination: AnimatorTransitionDestination): AnimatorTransition {
  return {
    id,
    destination: { ...destination },
    conditions: [],
    hasExitTime: true,
    exitTimeNormalized: 0.75,
    durationMode: "normalized",
    duration: 0.25,
    offsetNormalized: 0,
    interruptionSource: "none",
    orderedInterruption: true,
    canTransitionToSelf: false,
  };
}

function assertDestination(
  scope: AnimatorStateMachineScope,
  destination: AnimatorTransitionDestination,
): void {
  if (destination.kind === "state" && !scope.states.some((state) => state.id === destination.stateId)) {
    throw new AnimatorAuthoringError(`Animator state '${destination.stateId}' was not found.`);
  }
  if (destination.kind === "stateMachine"
    && !(scope.stateMachines ?? []).some((machine) => machine.id === destination.stateMachineId)) {
    throw new AnimatorAuthoringError(`Animator state machine '${destination.stateMachineId}' was not found.`);
  }
}

function assertNonSelfDestination(
  source: AnimatorTransitionSource,
  destination: AnimatorTransitionDestination,
): void {
  if (source.kind === "state"
    && destination.kind === "state"
    && source.stateId === destination.stateId) {
    throw new AnimatorAuthoringError("A state transition must target another state.");
  }
  if (source.kind === "stateMachine"
    && destination.kind === "stateMachine"
    && source.stateMachineId === destination.stateMachineId) {
    throw new AnimatorAuthoringError("A state-machine exit route must target another node.");
  }
}

function assertLayerCanExit(
  controller: AnimatorController,
  layerId: string,
  exitsRoot: boolean,
  destination: AnimatorTransitionDestination,
): void {
  if (destination.kind === "exit" && exitsRoot && controller.layers[0]?.id === layerId) {
    throw new AnimatorAuthoringError("The base Animator layer cannot transition to Exit Layer.");
  }
}

function assertOwnsStateMachine(layer: AnimatorLayer): void {
  if (layer.syncedLayerId) {
    throw new AnimatorAuthoringError("Synchronized layers inherit their transitions from the source layer.");
  }
}

function nonNegativeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function addAnimatorTransition(
  controller: AnimatorController,
  layerId: string,
  source: AnimatorTransitionSource,
  destination: AnimatorTransitionDestination,
  options: { id?: string } = {},
): AnimatorController {
  assertNonSelfDestination(source, destination);
  return updateLayer(controller, layerId, (layer) => {
    assertOwnsStateMachine(layer);
    const scope = transitionScope(layer, source);
    assertLayerCanExit(controller, layerId, scope === layer, destination);
    assertDestination(scope, destination);
    const scopeMachineId = source.kind === "anyState"
      ? source.stateMachineId
      : source.kind === "stateMachine"
        ? findAnimatorStateMachine(layer, source.stateMachineId)?.parent === layer
          ? undefined
          : findParentMachineId(layer, source.stateMachineId)
        : findAnimatorState(layer, source.stateId)?.ownerMachineId;
    if (!canAddAnimatorTransition(layer, source.kind, scopeMachineId)) {
      throw new AnimatorAuthoringError(
        `Animator layer '${layerId}' cannot exceed ${MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER} authored or compiled transitions.`,
      );
    }
    const id = options.id ?? createAuthoredId("animator-transition");
    const allTransitions = [
      ...allAnimatorTransitions(layer),
    ];
    if (allTransitions.some((transition) => transition.id === id)) {
      throw new AnimatorAuthoringError(`Animator transition '${id}' already exists.`);
    }
    const transition = newTransition(id, destination);
    let next: AnimatorLayer;
    if (source.kind === "anyState") {
      next = source.stateMachineId
        ? updateMachine(layer, source.stateMachineId, (machine) => ({
            ...machine,
            anyStateTransitions: [...machine.anyStateTransitions, transition],
          }))
        : { ...layer, anyStateTransitions: [...layer.anyStateTransitions, transition] };
    } else if (source.kind === "stateMachine") {
      next = updateMachine(layer, source.stateMachineId, (machine) => ({
        ...machine,
        transitions: [...machine.transitions, transition],
      }));
    } else {
      next = updateStateTransitionList(layer, source.stateId, (transitions) => [
        ...transitions,
        transition,
      ]);
    }
    assertCompiledTransitionBudgets(next);
    return next;
  });
}

function mapTransition(
  layer: AnimatorLayer,
  source: AnimatorTransitionSource,
  transitionId: string,
  update: (transition: AnimatorTransition) => AnimatorTransition | null,
): AnimatorLayer {
  assertOwnsStateMachine(layer);
  let found = false;
  const apply = (transition: AnimatorTransition) => {
    if (transition.id !== transitionId) return [transition];
    found = true;
    const next = update(transition);
    return next ? [next] : [];
  };
  let next: AnimatorLayer;
  if (source.kind === "anyState") {
    next = source.stateMachineId
      ? updateMachine(layer, source.stateMachineId, (machine) => ({
          ...machine,
          anyStateTransitions: machine.anyStateTransitions.flatMap(apply),
        }))
      : { ...layer, anyStateTransitions: layer.anyStateTransitions.flatMap(apply) };
  } else if (source.kind === "stateMachine") {
    next = updateMachine(layer, source.stateMachineId, (machine) => ({
      ...machine,
      transitions: machine.transitions.flatMap(apply),
    }));
  } else {
    next = updateStateTransitionList(layer, source.stateId, (transitions) => transitions.flatMap(apply));
  }
  if (!found) throw new AnimatorAuthoringError(`Animator transition '${transitionId}' was not found.`);
  return next;
}

export function patchAnimatorTransition(
  controller: AnimatorController,
  layerId: string,
  source: AnimatorTransitionSource,
  transitionId: string,
  patch: AnimatorTransitionPatch,
): AnimatorController {
  return updateLayer(controller, layerId, (layer) => {
    const next = mapTransition(layer, source, transitionId, (transition) => {
      if (patch.conditions
        && patch.conditions.length > MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION) {
        throw new AnimatorAuthoringError(
          `An Animator transition cannot exceed ${MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION} conditions.`,
        );
      }
      const normalizedPatch = {
        ...patch,
        ...(patch.exitTimeNormalized !== undefined
          ? { exitTimeNormalized: nonNegativeFinite(patch.exitTimeNormalized, transition.exitTimeNormalized) }
          : {}),
        ...(patch.duration !== undefined
          ? { duration: nonNegativeFinite(patch.duration, transition.duration) }
          : {}),
        ...(patch.offsetNormalized !== undefined
          ? { offsetNormalized: nonNegativeFinite(patch.offsetNormalized, transition.offsetNormalized) }
          : {}),
      };
      return { ...transition, ...normalizedPatch, id: transition.id };
    });
    assertCompiledTransitionBudgets(next);
    return next;
  });
}

export function removeAnimatorTransition(
  controller: AnimatorController,
  layerId: string,
  source: AnimatorTransitionSource,
  transitionId: string,
): AnimatorController {
  return updateLayer(controller, layerId, (layer) => mapTransition(
    layer,
    source,
    transitionId,
    () => null,
  ));
}

export function conditionForParameter(parameter: AnimatorParameter): AnimatorCondition {
  if (parameter.kind === "boolean") return { parameterId: parameter.id, mode: "if" };
  if (parameter.kind === "trigger") return { parameterId: parameter.id, mode: "triggered" };
  return { parameterId: parameter.id, mode: "greater", threshold: 0 };
}

function transitionScope(
  layer: AnimatorLayer,
  source: AnimatorTransitionSource,
): AnimatorStateMachineScope {
  if (source.kind === "anyState") {
    if (!source.stateMachineId) return layer;
    const location = findAnimatorStateMachine(layer, source.stateMachineId);
    if (location) return location.machine;
    throw new AnimatorAuthoringError(`Animator state machine '${source.stateMachineId}' was not found.`);
  }
  if (source.kind === "stateMachine") {
    const location = findAnimatorStateMachine(layer, source.stateMachineId);
    if (location) return location.parent;
    throw new AnimatorAuthoringError(`Animator state machine '${source.stateMachineId}' was not found.`);
  }
  const location = findAnimatorState(layer, source.stateId);
  if (location) return location.owner;
  throw new AnimatorAuthoringError(`Animator state '${source.stateId}' was not found.`);
}

function findParentMachineId(layer: AnimatorLayer, stateMachineId: string): string | undefined {
  const path: AnimatorStateMachine[] = [];
  const visit = (scope: AnimatorLayer | AnimatorStateMachine): boolean => {
    for (const child of scope.stateMachines ?? []) {
      path.push(child);
      if (child.id === stateMachineId || visit(child)) return true;
      path.pop();
    }
    return false;
  };
  if (!visit(layer) || path.length < 2) return undefined;
  return path[path.length - 2]?.id;
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

function updateStateTransitionList(
  layer: AnimatorLayer,
  stateId: string,
  update: (transitions: AnimatorTransition[]) => AnimatorTransition[],
): AnimatorLayer {
  let found = false;
  const mapStates = (states: AnimatorLayer["states"]): AnimatorLayer["states"] => states.map((state) => {
    if (state.id !== stateId) return state;
    found = true;
    return { ...state, transitions: update(state.transitions) };
  });
  const mapMachine = (machine: AnimatorStateMachine): AnimatorStateMachine => ({
    ...machine,
    states: mapStates(machine.states),
    stateMachines: machine.stateMachines.map(mapMachine),
  });
  const next = {
    ...layer,
    states: mapStates(layer.states),
    stateMachines: (layer.stateMachines ?? []).map(mapMachine),
  };
  if (!found) throw new AnimatorAuthoringError(`Animator state '${stateId}' was not found.`);
  return next;
}

function allAnimatorTransitions(layer: AnimatorLayer): AnimatorTransition[] {
  const transitions = [
    ...layer.anyStateTransitions,
    ...layer.states.flatMap((state) => state.transitions),
  ];
  for (const machine of animatorStateMachinesInLayer(layer)) transitions.push(
    ...machine.transitions,
    ...machine.anyStateTransitions,
    ...machine.states.flatMap((state) => state.transitions),
  );
  return transitions;
}

function assertCompiledTransitionBudgets(layer: AnimatorLayer): void {
  const analysis = animatorLayerTransitionBudget(layer);
  if (analysis.authoredTransitionCount > MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER
    || analysis.compiledTransitionCount > MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER) {
    throw new AnimatorAuthoringError(
      `Animator layer '${layer.id}' cannot exceed ${MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER} authored or compiled transitions.`,
    );
  }
  if (analysis.maximumCompiledConditionCount > MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION) {
    throw new AnimatorAuthoringError(
      `A compiled Animator transition cannot exceed ${MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION} combined conditions across nested Exit routes.`,
    );
  }
}
