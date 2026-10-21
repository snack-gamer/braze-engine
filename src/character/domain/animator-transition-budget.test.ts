import { describe, expect, it } from "vitest";
import { ANIMATOR_DOCUMENT_LIMITS } from "./character-document-limits";
import {
  analyzeAnimatorTransitionBudget,
  type AnimatorTransitionBudgetEdge,
  type AnimatorTransitionBudgetScope,
} from "./animator-transition-budget";

const direct = (conditionCount = 0): AnimatorTransitionBudgetEdge => ({
  exitsScope: false,
  conditionCount,
});
const exit = (conditionCount = 0): AnimatorTransitionBudgetEdge => ({
  exitsScope: true,
  conditionCount,
});

describe("Animator transition expansion budgets", () => {
  it("counts recursive Exit-route products and combined path conditions", () => {
    const source: AnimatorTransitionBudgetScope = {
      directStateCount: 1,
      stateTransitions: [],
      anyStateTransitions: [],
      exitRoutes: [],
      stateMachines: [{
        id: "outer",
        directStateCount: 0,
        stateTransitions: [],
        anyStateTransitions: [],
        exitRoutes: [direct(7), direct(8)],
        stateMachines: [{
          id: "inner",
          directStateCount: 1,
          stateTransitions: [exit(4)],
          anyStateTransitions: [],
          exitRoutes: [exit(3), exit(5), exit(2)],
          stateMachines: [],
        }],
      }],
    };

    expect(analyzeAnimatorTransitionBudget(source)).toEqual({
      authoredTransitionCount: 6,
      compiledTransitionCount: 6,
      maximumCompiledConditionCount: 17,
    });
  });

  it("saturates exponential route growth one beyond the runtime limit", () => {
    let child: AnimatorTransitionBudgetScope = {
      id: "machine-4",
      directStateCount: 1,
      stateTransitions: [exit()],
      anyStateTransitions: [],
      exitRoutes: Array.from({ length: 8 }, () => exit()),
      stateMachines: [],
    };
    for (let depth = 3; depth >= 1; depth -= 1) child = {
      id: `machine-${depth}`,
      directStateCount: 0,
      stateTransitions: [],
      anyStateTransitions: [],
      exitRoutes: Array.from(
        { length: 8 },
        () => depth === 1 ? direct() : exit(),
      ),
      stateMachines: [child],
    };
    const root: AnimatorTransitionBudgetScope = {
      directStateCount: 1,
      stateTransitions: [],
      anyStateTransitions: [],
      exitRoutes: [],
      stateMachines: [child],
    };

    expect(analyzeAnimatorTransitionBudget(root).compiledTransitionCount).toBe(
      ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer + 1,
    );
  });
});
