import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorStateMachine,
  AnimatorTransition,
} from "../domain/animator-controller";
import {
  analyzeAnimatorTransitionBudget,
  type AnimatorTransitionBudgetAnalysis,
  type AnimatorTransitionBudgetEdge,
  type AnimatorTransitionBudgetScope,
} from "../domain/animator-transition-budget";
import {
  CharacterCodecError,
  arrayWithinLimit,
  assertArrayWithinLimit,
  record,
} from "./character-codec-values";

export function assertPersistedAnimatorLayerTransitionBudget(
  input: Record<string, unknown>,
  path: string,
): void {
  const totals = { states: 0, machines: 0 };
  const scope = inspectPersistedMachine(input, path, 0, totals, new WeakSet<object>());
  assertCollectionTotal(totals.states, ANIMATOR_DOCUMENT_LIMITS.statesPerLayer, `${path}.states`);
  assertCollectionTotal(
    totals.machines,
    ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer,
    `${path}.stateMachines`,
  );
  assertTransitionAnalysis(analyzeAnimatorTransitionBudget(scope), `${path}.transitions`);
}

export function assertAnimatorControllerDocumentBudget(controller: AnimatorController): void {
  assertArrayWithinLimit(
    controller.parameters,
    "parameters",
    ANIMATOR_DOCUMENT_LIMITS.parametersPerController,
  );
  assertArrayWithinLimit(controller.layers, "layers", ANIMATOR_DOCUMENT_LIMITS.layersPerController);
  for (let layerIndex = 0; layerIndex < controller.layers.length; layerIndex += 1) {
    const layer = controller.layers[layerIndex]!;
    const layerPath = `layers[${layerIndex}]`;
    const totals = { states: 0, machines: 0 };
    const scope = inspectAuthoredMachine(layer, layerPath, 0, totals, new WeakSet<object>());
    assertCollectionTotal(totals.states, ANIMATOR_DOCUMENT_LIMITS.statesPerLayer, `${layerPath}.states`);
    assertCollectionTotal(
      totals.machines,
      ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer,
      `${layerPath}.stateMachines`,
    );
    assertTransitionAnalysis(
      analyzeAnimatorTransitionBudget(scope),
      `${layerPath}.transitions`,
    );
  }
}

type DocumentTotals = { states: number; machines: number };

function inspectPersistedMachine(
  input: Record<string, unknown>,
  path: string,
  depth: number,
  totals: DocumentTotals,
  active: WeakSet<object>,
): AnimatorTransitionBudgetScope {
  assertMachineDepth(depth, path);
  if (active.has(input)) throw new CharacterCodecError(
    "invalid-topology",
    path,
    "state machines cannot contain a cycle",
  );
  active.add(input);
  const states = arrayWithinLimit(input.states, `${path}.states`, ANIMATOR_DOCUMENT_LIMITS.statesPerLayer);
  const anyState = arrayWithinLimit(
    input.anyStateTransitions ?? input.any_state_transitions,
    `${path}.anyStateTransitions`,
    ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer,
  );
  const outgoing = depth === 0 ? [] : arrayWithinLimit(
    input.transitions,
    `${path}.transitions`,
    ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer,
  );
  totals.states += states.length;
  const stateRecords = states.flatMap((value, index) => {
    const state = record(value);
    if (!state) return [];
    const transitions = arrayWithinLimit(
      state.transitions,
      `${path}.states[${index}].transitions`,
      ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer,
    );
    return [{
      transitions: persistedBudgetEdges(
        transitions,
        `${path}.states[${index}].transitions`,
      ),
    }];
  });
  const children = arrayWithinLimit(
    input.stateMachines ?? input.state_machines,
    `${path}.stateMachines`,
    ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer,
  );
  totals.machines += children.length;
  const stateMachines = children.flatMap((value, index): AnimatorTransitionBudgetScope[] => {
    const child = record(value);
    if (!child) return [];
    return [inspectPersistedMachine(
      child,
      `${path}.stateMachines[${index}]`,
      depth + 1,
      totals,
      active,
    )];
  });
  active.delete(input);
  return {
    directStateCount: stateRecords.length,
    stateTransitions: stateRecords.flatMap((state) => state.transitions),
    anyStateTransitions: persistedBudgetEdges(anyState, `${path}.anyStateTransitions`),
    exitRoutes: persistedBudgetEdges(outgoing, `${path}.transitions`),
    stateMachines,
  };
}

function inspectAuthoredMachine(
  machine: AnimatorLayer | AnimatorStateMachine,
  path: string,
  depth: number,
  totals: DocumentTotals,
  active: WeakSet<object>,
): AnimatorTransitionBudgetScope {
  assertMachineDepth(depth, path);
  if (active.has(machine)) throw new CharacterCodecError(
    "invalid-topology",
    path,
    "state machines cannot contain a cycle",
  );
  active.add(machine);
  assertArrayWithinLimit(machine.states, `${path}.states`, ANIMATOR_DOCUMENT_LIMITS.statesPerLayer);
  assertArrayWithinLimit(
    machine.anyStateTransitions,
    `${path}.anyStateTransitions`,
    ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer,
  );
  const outgoing = "transitions" in machine ? machine.transitions : [];
  assertArrayWithinLimit(outgoing, `${path}.transitions`, ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer);
  totals.states += machine.states.length;
  const transitions: AnimatorTransition[] = [...machine.anyStateTransitions, ...outgoing];
  machine.states.forEach((state, stateIndex) => {
    const statePath = `${path}.states[${stateIndex}]`;
    assertArrayWithinLimit(
      state.transitions,
      `${statePath}.transitions`,
      ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer,
    );
    assertArrayWithinLimit(
      state.events,
      `${statePath}.events`,
      ANIMATOR_DOCUMENT_LIMITS.stateEventsPerState,
    );
    transitions.push(...state.transitions);
  });
  transitions.forEach((transition, index) => assertArrayWithinLimit(
    transition.conditions,
    `${path}.transitions[${index}].conditions`,
    ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition,
  ));
  const children = machine.stateMachines ?? [];
  assertArrayWithinLimit(
    children,
    `${path}.stateMachines`,
    ANIMATOR_DOCUMENT_LIMITS.stateMachinesPerLayer,
  );
  totals.machines += children.length;
  const stateMachines = children.map((child, index) => inspectAuthoredMachine(
      child,
      `${path}.stateMachines[${index}]`,
      depth + 1,
      totals,
      active,
    ));
  active.delete(machine);
  return {
    directStateCount: machine.states.length,
    stateTransitions: machine.states.flatMap((state) => state.transitions.map(authoredBudgetEdge)),
    anyStateTransitions: machine.anyStateTransitions.map(authoredBudgetEdge),
    exitRoutes: outgoing.map(authoredBudgetEdge),
    stateMachines,
  };
}

function assertMachineDepth(depth: number, path: string): void {
  if (depth <= ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth) return;
  throw new CharacterCodecError(
    "invalid-topology",
    path,
    `cannot exceed state-machine depth ${ANIMATOR_DOCUMENT_LIMITS.stateMachineDepth}`,
  );
}

function assertCollectionTotal(actual: number, maximum: number, path: string): void {
  if (actual <= maximum) return;
  throw new CharacterCodecError("invalid-document", path, `cannot exceed ${maximum} entries`);
}

function assertTransitionAnalysis(
  analysis: AnimatorTransitionBudgetAnalysis,
  path: string,
): void {
  if (analysis.authoredTransitionCount > ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer
    || analysis.compiledTransitionCount > ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer) {
    throw new CharacterCodecError(
      "invalid-document",
      path,
      `cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer} authored or compiled entries`,
    );
  }
  if (analysis.maximumCompiledConditionCount > ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition) {
    throw new CharacterCodecError(
      "invalid-document",
      path,
      `compiled transitions cannot exceed ${ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition} combined conditions`,
    );
  }
}

function persistedBudgetEdges(
  values: readonly unknown[],
  path: string,
): AnimatorTransitionBudgetEdge[] {
  return values.flatMap((value, index): AnimatorTransitionBudgetEdge[] => {
    const transition = record(value);
    if (!transition) return [];
    const destination = record(transition.destination);
    const legacyStateId = nonEmptyString(
      transition.destinationStateId ?? transition.destination_state_id,
    );
    return [{
      exitsScope: destination?.kind === "exit" || (!destination && !legacyStateId),
      conditionCount: persistedConditionCount(
        transition.conditions,
        `${path}[${index}].conditions`,
      ),
    }];
  });
}

function persistedConditionCount(value: unknown, path: string): number {
  const conditions = arrayWithinLimit(
    value,
    path,
    ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition,
  );
  return conditions.filter((value) => {
    const condition = record(value);
    return Boolean(
      condition
      && nonEmptyString(condition.parameterId ?? condition.parameter_id)
      && (condition.mode === "if"
        || condition.mode === "ifNot"
        || condition.mode === "triggered"
        || condition.mode === "greater"
        || condition.mode === "less"
        || condition.mode === "equals"
        || condition.mode === "notEqual"),
    );
  }).length;
}

function authoredBudgetEdge(transition: AnimatorTransition): AnimatorTransitionBudgetEdge {
  return {
    exitsScope: transition.destination.kind === "exit",
    conditionCount: transition.conditions.length,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}
