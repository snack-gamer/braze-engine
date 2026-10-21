import type { AnimatorController, AnimatorLayer } from "../domain/animator-controller";
import {
  animatorStatesInLayer,
  childAnimatorStateMachines,
  findAnimatorStateMachine,
  type AnimatorStateMachineScope,
} from "../domain/animator-state-machine";
import {
  animatorLayerTransitionBudget,
  animatorLayerTransitionBudgetAfterAddingState,
  type AnimatorTransitionBudgetAnalysis,
} from "../domain/animator-transition-budget";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";

export const MAX_AUTHORED_ANIMATOR_PARAMETERS = ANIMATOR_DOCUMENT_LIMITS.parametersPerController;
export const MAX_AUTHORED_ANIMATOR_LAYERS = ANIMATOR_DOCUMENT_LIMITS.layersPerController;
export const MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER = ANIMATOR_DOCUMENT_LIMITS.statesPerLayer;
export const MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER = ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer;
export const MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION = ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition;

export function authoredAnimatorTransitionCount(layer: AnimatorLayer): number {
  return animatorLayerTransitionBudget(layer).authoredTransitionCount;
}

export function compiledAnimatorTransitionCount(layer: AnimatorLayer): number {
  return animatorLayerTransitionBudget(layer).compiledTransitionCount;
}

export function canAddAnimatorParameter(controller: AnimatorController): boolean {
  return controller.parameters.length < MAX_AUTHORED_ANIMATOR_PARAMETERS;
}

export function canAddAnimatorLayer(controller: AnimatorController): boolean {
  return controller.layers.length < MAX_AUTHORED_ANIMATOR_LAYERS;
}

export function canAddAnimatorState(layer: AnimatorLayer, stateMachineId?: string): boolean {
  const prospective = animatorLayerTransitionBudgetAfterAddingState(layer, stateMachineId);
  return animatorStatesInLayer(layer).length < MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER
    && animatorLayerFitsTransitionBudgets(prospective);
}

export function canAddAnimatorTransition(
  layer: AnimatorLayer,
  source: "state" | "anyState" | "stateMachine",
  stateMachineId?: string,
): boolean {
  const scope = stateMachineId ? findAnimatorStateMachine(layer, stateMachineId)?.machine : layer;
  const minimumCompiledAddition = source === "anyState" && scope
    ? statesInScope(scope)
    : source === "stateMachine" ? 0 : 1;
  const current = animatorLayerTransitionBudget(layer);
  return current.authoredTransitionCount < MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER
    && current.compiledTransitionCount + minimumCompiledAddition
      <= MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER
    && current.maximumCompiledConditionCount <= MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION;
}

export function canAddAnimatorCondition(conditionCount: number): boolean {
  return conditionCount < MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION;
}

export function animatorLayerFitsTransitionBudgets(
  analysis: AnimatorTransitionBudgetAnalysis,
): boolean {
  return analysis.authoredTransitionCount <= MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER
    && analysis.compiledTransitionCount <= MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER
    && analysis.maximumCompiledConditionCount <= MAX_AUTHORED_ANIMATOR_CONDITIONS_PER_TRANSITION;
}

function statesInScope(scope: AnimatorStateMachineScope): number {
  return scope.states.length + childAnimatorStateMachines(scope).reduce(
    (total, child) => total + statesInScope(child),
    0,
  );
}
