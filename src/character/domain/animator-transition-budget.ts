import type {
  AnimatorLayer,
  AnimatorStateMachine,
  AnimatorTransition,
} from "./animator-controller";
import { ANIMATOR_DOCUMENT_LIMITS } from "./character-document-limits";

export type AnimatorTransitionBudgetEdge = Readonly<{
  exitsScope: boolean;
  conditionCount: number;
}>;

/** Minimal recursive shape needed to budget flat runtime transition expansion. */
export type AnimatorTransitionBudgetScope = Readonly<{
  id?: string;
  directStateCount: number;
  stateTransitions: readonly AnimatorTransitionBudgetEdge[];
  anyStateTransitions: readonly AnimatorTransitionBudgetEdge[];
  exitRoutes: readonly AnimatorTransitionBudgetEdge[];
  stateMachines: readonly AnimatorTransitionBudgetScope[];
}>;

export type AnimatorTransitionBudgetAnalysis = Readonly<{
  authoredTransitionCount: number;
  /** Saturates at one beyond the persisted/runtime transition limit. */
  compiledTransitionCount: number;
  maximumCompiledConditionCount: number;
}>;

type BudgetScopeNode = {
  source: AnimatorTransitionBudgetScope;
  parent: BudgetScopeNode | null;
  children: BudgetScopeNode[];
  descendantStateCount: number;
};

type ExitSummary = Readonly<{
  variantCount: number;
  maximumRouteConditionCount: number;
}>;

const COMPILED_COUNT_CAP = ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer + 1;

/**
 * Counts runtime variants without enumerating an exponentially branching Exit
 * graph. Exit-route counts are summed/multiplied with saturation at the first
 * value that is already over budget.
 */
export function analyzeAnimatorTransitionBudget(
  source: AnimatorTransitionBudgetScope,
): AnimatorTransitionBudgetAnalysis {
  const root = buildBudgetScopeNode(source, null, new WeakSet<object>());
  if (!root) return {
    authoredTransitionCount: 0,
    compiledTransitionCount: 0,
    maximumCompiledConditionCount: 0,
  };
  populateDescendantStateCounts(root);
  const exitSummaries = new WeakMap<BudgetScopeNode, ExitSummary>();
  let authoredTransitionCount = 0;
  let compiledTransitionCount = 0;
  let maximumCompiledConditionCount = 0;

  for (const scope of flattenBudgetScopes(root)) {
    authoredTransitionCount = saturatedAdd(
      authoredTransitionCount,
      scope.source.stateTransitions.length
        + scope.source.anyStateTransitions.length
        + scope.source.exitRoutes.length,
    );
    for (const transition of scope.source.stateTransitions) addCompiled(transition, scope, 1);
    for (const transition of scope.source.anyStateTransitions) {
      addCompiled(transition, scope, scope.descendantStateCount);
    }
  }
  return {
    authoredTransitionCount,
    compiledTransitionCount,
    maximumCompiledConditionCount,
  };

  function addCompiled(
    transition: AnimatorTransitionBudgetEdge,
    scope: BudgetScopeNode,
    sourceCount: number,
  ): void {
    if (sourceCount === 0) return;
    const exit = transition.exitsScope
      ? summarizeExit(scope, exitSummaries)
      : { variantCount: 1, maximumRouteConditionCount: 0 };
    if (exit.variantCount === 0) return;
    compiledTransitionCount = saturatedAdd(
      compiledTransitionCount,
      saturatedMultiply(sourceCount, exit.variantCount),
    );
    maximumCompiledConditionCount = Math.max(
      maximumCompiledConditionCount,
      transition.conditionCount + exit.maximumRouteConditionCount,
    );
  }
}

export function animatorLayerTransitionBudget(
  layer: AnimatorLayer,
): AnimatorTransitionBudgetAnalysis {
  return analyzeAnimatorTransitionBudget(animatorTransitionBudgetScope(layer));
}

/** Exact prospective count for adding one transition-free leaf to a scope. */
export function animatorLayerTransitionBudgetAfterAddingState(
  layer: AnimatorLayer,
  stateMachineId?: string,
): AnimatorTransitionBudgetAnalysis {
  const targetId = stateMachineId ?? null;
  return analyzeAnimatorTransitionBudget(animatorTransitionBudgetScope(
    layer,
    targetId,
  ));
}

function animatorTransitionBudgetScope(
  source: AnimatorLayer | AnimatorStateMachine,
  additionalStateScopeId: string | null | undefined = undefined,
  id: string | null = null,
  active = new WeakSet<object>(),
): AnimatorTransitionBudgetScope {
  if (active.has(source)) return emptyBudgetScope(id);
  active.add(source);
  const scope: AnimatorTransitionBudgetScope = {
    ...(id ? { id } : {}),
    directStateCount: source.states.length + (additionalStateScopeId === id ? 1 : 0),
    stateTransitions: source.states.flatMap((state) => state.transitions.map(transitionBudgetEdge)),
    anyStateTransitions: source.anyStateTransitions.map(transitionBudgetEdge),
    exitRoutes: "transitions" in source ? source.transitions.map(transitionBudgetEdge) : [],
    stateMachines: (source.stateMachines ?? []).map((machine) => animatorTransitionBudgetScope(
      machine,
      additionalStateScopeId,
      machine.id,
      active,
    )),
  };
  active.delete(source);
  return scope;
}

function transitionBudgetEdge(transition: AnimatorTransition): AnimatorTransitionBudgetEdge {
  return {
    exitsScope: transition.destination.kind === "exit",
    conditionCount: transition.conditions.length,
  };
}

function emptyBudgetScope(id: string | null): AnimatorTransitionBudgetScope {
  return {
    ...(id ? { id } : {}),
    directStateCount: 0,
    stateTransitions: [],
    anyStateTransitions: [],
    exitRoutes: [],
    stateMachines: [],
  };
}

function buildBudgetScopeNode(
  source: AnimatorTransitionBudgetScope,
  parent: BudgetScopeNode | null,
  active: WeakSet<object>,
): BudgetScopeNode | null {
  if (active.has(source)) return null;
  active.add(source);
  const node: BudgetScopeNode = { source, parent, children: [], descendantStateCount: 0 };
  for (const child of source.stateMachines) {
    const nested = buildBudgetScopeNode(child, node, active);
    if (nested) node.children.push(nested);
  }
  active.delete(source);
  return node;
}

function populateDescendantStateCounts(scope: BudgetScopeNode): number {
  scope.descendantStateCount = saturatedAdd(
    scope.source.directStateCount,
    scope.children.reduce((total, child) => (
      saturatedAdd(total, populateDescendantStateCounts(child))
    ), 0),
  );
  return scope.descendantStateCount;
}

function summarizeExit(
  scope: BudgetScopeNode,
  memo: WeakMap<BudgetScopeNode, ExitSummary>,
): ExitSummary {
  const cached = memo.get(scope);
  if (cached) return cached;
  if (!scope.parent) {
    const root = { variantCount: 1, maximumRouteConditionCount: 0 };
    memo.set(scope, root);
    return root;
  }
  let variantCount = 0;
  let maximumRouteConditionCount = 0;
  for (const route of scope.source.exitRoutes) {
    const parentExit = route.exitsScope
      ? summarizeExit(scope.parent, memo)
      : { variantCount: 1, maximumRouteConditionCount: 0 };
    variantCount = saturatedAdd(variantCount, parentExit.variantCount);
    if (parentExit.variantCount > 0) maximumRouteConditionCount = Math.max(
      maximumRouteConditionCount,
      route.conditionCount + parentExit.maximumRouteConditionCount,
    );
  }
  const summary = { variantCount, maximumRouteConditionCount };
  memo.set(scope, summary);
  return summary;
}

function flattenBudgetScopes(root: BudgetScopeNode): BudgetScopeNode[] {
  return [root, ...root.children.flatMap(flattenBudgetScopes)];
}

function saturatedAdd(left: number, right: number): number {
  return Math.min(COMPILED_COUNT_CAP, left + right);
}

function saturatedMultiply(left: number, right: number): number {
  if (left === 0 || right === 0) return 0;
  if (left > COMPILED_COUNT_CAP / right) return COMPILED_COUNT_CAP;
  return Math.min(COMPILED_COUNT_CAP, left * right);
}
