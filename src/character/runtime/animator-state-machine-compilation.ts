import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type {
  AnimatorCondition,
} from "../domain/animator-parameters";
import type {
  AnimatorLayer,
  AnimatorState,
  AnimatorStateMachine,
  AnimatorTransition,
  AnimatorTransitionDestination,
} from "../domain/animator-controller";
import { animatorLayerTransitionBudget } from "../domain/animator-transition-budget";
import type { CharacterRuntimeDiagnostic } from "./diagnostics";

export type PlannedAnimatorTransition = Readonly<{
  id: string;
  sourceStateId: string;
  destinationStateId: string | null;
  transition: AnimatorTransition;
  conditions: readonly AnimatorCondition[];
  fromAnyState: boolean;
  authoringOrder: number;
}>;

export type AnimatorStateMachineCompilationPlan = Readonly<{
  initialStateId: string;
  states: readonly AnimatorState[];
  transitions: readonly PlannedAnimatorTransition[];
  diagnostics: readonly CharacterRuntimeDiagnostic[];
}>;

type MachineScope = {
  id: string | null;
  source: AnimatorLayer | AnimatorStateMachine;
  parent: MachineScope | null;
  children: MachineScope[];
  depth: number;
};

type ResolvedDestination = Readonly<{
  stateId: string | null;
  routeIds: readonly string[];
  conditions: readonly AnimatorCondition[];
}>;

/** Elaborates recursive authored machines into the existing flat leaf-state runtime graph. */
export function planAnimatorLayerStateMachine(
  layer: AnimatorLayer,
): AnimatorStateMachineCompilationPlan {
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const stateIds = new Set<string>();
  const machineIds = new Set<string>();
  let machineCount = 0;
  const transitionBudget = animatorLayerTransitionBudget(layer);
  const root = buildScope(layer, null, null, 0, new WeakSet<object>());
  const states = root ? flattenStates(root) : [];
  const ownerByStateId = new Map<string, MachineScope>();
  if (root) collectStateOwners(root, ownerByStateId);
  const transitions: PlannedAnimatorTransition[] = [];
  let overflow = false;
  let conditionOverflow = false;

  if (root) {
    // Preserve legacy priority: outer Any State transitions are expanded first.
    for (const scope of flattenScopes(root)) {
      const descendants = flattenStates(scope);
      for (const state of descendants) {
        for (const transition of scope.source.anyStateTransitions) {
          appendTransitionVariants(scope, state, transition, true);
        }
      }
    }
    for (const state of states) {
      const owner = ownerByStateId.get(state.id);
      if (!owner) continue;
      for (const transition of state.transitions) {
        appendTransitionVariants(owner, state, transition, false);
      }
    }
  }

  if (states.length > ANIMATOR_DOCUMENT_LIMITS.statesPerLayer) diagnostics.push(error(
    "animator-state-budget-exceeded",
    `Layer ${layer.id} cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.statesPerLayer} states across nested machines.`,
  ));
  if (machineCount > ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer) diagnostics.push(error(
    "animator-state-machine-budget-exceeded",
    `Layer ${layer.id} cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer} nested state machines.`,
  ));
  if (transitionBudget.authoredTransitionCount > ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer
    || transitionBudget.compiledTransitionCount > ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer
    || overflow) {
    diagnostics.push(error(
      "animator-transition-budget-exceeded",
      `Layer ${layer.id} cannot compile more than ${ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer} transitions.`,
    ));
  }
  if (transitionBudget.maximumCompiledConditionCount
      > ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition
    || conditionOverflow) diagnostics.push(error(
    "animator-condition-budget-exceeded",
    `Layer ${layer.id} cannot compile a transition with more than ${ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition} combined conditions.`,
  ));
  return {
    initialStateId: root ? resolveDefaultState(root, new Set()) ?? "" : "",
    states,
    transitions,
    diagnostics,
  };

  function buildScope(
    source: AnimatorLayer | AnimatorStateMachine,
    id: string | null,
    parent: MachineScope | null,
    depth: number,
    active: WeakSet<object>,
  ): MachineScope | null {
    if (depth > ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth) {
      diagnostics.push(error(
        "animator-state-machine-depth-exceeded",
        `Layer ${layer.id} exceeds state-machine depth ${ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth}.`,
      ));
      return null;
    }
    if (active.has(source)) {
      diagnostics.push(error(
        "cyclic-animator-state-machine",
        `Layer ${layer.id} contains a cyclic state-machine object graph.`,
      ));
      return null;
    }
    active.add(source);
    if (id !== null) {
      machineCount += 1;
      if (!id || machineIds.has(id) || stateIds.has(id)) diagnostics.push(error(
        "duplicate-animator-state-machine",
        `Layer ${layer.id} contains an empty or duplicate state-machine ID.`,
      ));
      machineIds.add(id);
    }
    for (const state of source.states) {
      if (!state.id || stateIds.has(state.id) || machineIds.has(state.id)) diagnostics.push(error(
        "duplicate-animator-state",
        `Layer ${layer.id} contains an empty or duplicate state ID.`,
      ));
      stateIds.add(state.id);
      validateConditions(state.transitions);
    }
    validateConditions(source.anyStateTransitions);
    if ("transitions" in source) {
      validateConditions(source.transitions);
    }
    const scope: MachineScope = { id, source, parent, children: [], depth };
    for (const child of source.stateMachines ?? []) {
      const nested = buildScope(child, child.id, scope, depth + 1, active);
      if (nested) scope.children.push(nested);
    }
    active.delete(source);
    return scope;
  }

  function validateConditions(transitionsToValidate: readonly AnimatorTransition[]): void {
    if (transitionsToValidate.some((transition) => (
      transition.conditions.length > ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition
    ))) diagnostics.push(error(
      "animator-condition-budget-exceeded",
      `Layer ${layer.id} has a transition exceeding ${ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition} conditions.`,
    ));
  }

  function appendTransitionVariants(
    scope: MachineScope,
    state: AnimatorState,
    transition: AnimatorTransition,
    fromAnyState: boolean,
  ): void {
    const variants = resolveDestination(scope, transition.destination, new Set());
    variants.forEach((variant, index) => {
      if (transitions.length >= ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer) {
        overflow = true;
        return;
      }
      const expanded = fromAnyState || variant.routeIds.length > 0 || variants.length > 1;
      const expandedId = fromAnyState && variant.routeIds.length === 0 && variants.length === 1
        ? `${transition.id}@${state.id}`
        : `${transition.id}@${state.id}${variant.routeIds.length > 0 ? `:${variant.routeIds.join(":")}` : ""}:${index}`;
      const conditions = [...transition.conditions, ...variant.conditions];
      if (conditions.length > ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition) {
        conditionOverflow = true;
        return;
      }
      transitions.push({
        id: expanded ? expandedId : transition.id,
        sourceStateId: state.id,
        destinationStateId: variant.stateId,
        transition,
        conditions,
        fromAnyState,
        authoringOrder: transitions.length,
      });
    });
  }

  function resolveDestination(
    scope: MachineScope,
    destination: AnimatorTransitionDestination,
    resolving: Set<MachineScope>,
  ): readonly ResolvedDestination[] {
    if (destination.kind === "state") {
      return scope.source.states.some((state) => state.id === destination.stateId)
        ? [{ stateId: destination.stateId, routeIds: [], conditions: [] }]
        : invalidDestination(`state ${destination.stateId}`);
    }
    if (destination.kind === "stateMachine") {
      const child = scope.children.find((candidate) => candidate.id === destination.stateMachineId);
      if (!child) return invalidDestination(`state machine ${destination.stateMachineId}`);
      const stateId = resolveDefaultState(child, new Set());
      return stateId ? [{ stateId, routeIds: [], conditions: [] }] : [];
    }
    if (!scope.parent) return [{ stateId: null, routeIds: [], conditions: [] }];
    if (resolving.has(scope)) {
      diagnostics.push(error(
        "cyclic-state-machine-exit-route",
        `State machine ${scope.id ?? layer.id} contains a cyclic Exit route.`,
      ));
      return [];
    }
    resolving.add(scope);
    const machine = scope.source as AnimatorStateMachine;
    if (machine.transitions.length === 0) diagnostics.push(error(
      "unrouted-state-machine-exit",
      `State machine ${machine.id} reaches Exit without a parent route.`,
    ));
    const output: ResolvedDestination[] = [];
    for (const route of machine.transitions) {
      for (const resolved of resolveDestination(scope.parent, route.destination, resolving)) {
        if (output.length >= ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer) {
          overflow = true;
          break;
        }
        output.push({
          stateId: resolved.stateId,
          routeIds: [route.id, ...resolved.routeIds],
          conditions: [...route.conditions, ...resolved.conditions],
        });
      }
    }
    resolving.delete(scope);
    return output;
  }

  function resolveDefaultState(
    scope: MachineScope,
    resolving: Set<MachineScope>,
  ): string | null {
    if (resolving.has(scope)) {
      diagnostics.push(error(
        "cyclic-state-machine-entry",
        `State machine ${scope.id ?? layer.id} contains a cyclic Entry route.`,
      ));
      return null;
    }
    resolving.add(scope);
    const defaultId = scope.source.defaultStateId;
    if (scope.source.states.some((state) => state.id === defaultId)) return defaultId;
    const child = scope.children.find((candidate) => candidate.id === defaultId);
    if (child) return resolveDefaultState(child, resolving);
    diagnostics.push(error(
      "invalid-state-machine-entry",
      `State machine ${scope.id ?? layer.id} has no valid default state or child machine.`,
      { layerId: layer.id, stateMachineId: scope.id ?? layer.id },
    ));
    return null;
  }

  function invalidDestination(label: string): readonly ResolvedDestination[] {
    diagnostics.push(error(
      "invalid-animator-transition",
      `Layer ${layer.id} has a transition to missing ${label}.`,
    ));
    return [];
  }
}

function flattenScopes(root: MachineScope): MachineScope[] {
  return [root, ...root.children.flatMap(flattenScopes)];
}

function flattenStates(root: MachineScope): AnimatorState[] {
  return [...root.source.states, ...root.children.flatMap(flattenStates)];
}

function collectStateOwners(root: MachineScope, target: Map<string, MachineScope>): void {
  root.source.states.forEach((state) => target.set(state.id, root));
  root.children.forEach((child) => collectStateOwners(child, target));
}

function error(
  code: string,
  message: string,
  details?: CharacterRuntimeDiagnostic["details"],
): CharacterRuntimeDiagnostic {
  return { code, severity: "error", message, ...(details ? { details } : {}) };
}
