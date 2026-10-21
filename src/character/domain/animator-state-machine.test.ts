import { describe, expect, it } from "vitest";
import {
  createAnimatorController,
  type AnimatorStateMachine,
} from "./animator-controller";
import { animatorStateMachinePath } from "./animator-state-machine";

function machine(
  id: string,
  name: string,
  stateMachines: AnimatorStateMachine[] = [],
): AnimatorStateMachine {
  return {
    id,
    name,
    defaultStateId: "",
    states: [],
    stateMachines,
    anyStateTransitions: [],
    transitions: [],
  };
}

describe("animatorStateMachinePath", () => {
  it("returns the root-to-leaf breadcrumb for a nested graph scope", () => {
    const airborne = machine("airborne", "Airborne");
    const locomotion = machine("locomotion", "Locomotion", [airborne]);
    const controller = createAnimatorController("controller");
    const layer = {
      ...controller.layers[0]!,
      stateMachines: [locomotion],
    };

    expect(animatorStateMachinePath(layer, "airborne").map(({ id }) => id))
      .toEqual(["locomotion", "airborne"]);
  });

  it("represents the layer root and a stale machine target as an empty path", () => {
    const controller = createAnimatorController("controller");
    const layer = {
      ...controller.layers[0]!,
      stateMachines: [machine("locomotion", "Locomotion")],
    };

    expect(animatorStateMachinePath(layer)).toEqual([]);
    expect(animatorStateMachinePath(layer, "deleted-machine")).toEqual([]);
  });
});
