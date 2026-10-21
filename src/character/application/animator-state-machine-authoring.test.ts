import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import {
  addAnimatorLayer,
  addAnimatorState as addRootState,
  setAnimatorLayerSynchronization,
} from "./animator-controller-authoring";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
  patchAnimatorStateMachine,
  removeAnimatorStateFromStateMachine,
  removeAnimatorStateMachine,
  setAnimatorStateMachineDefaultNode,
  setAnimatorStateMachineStateMotion,
} from "./animator-state-machine-authoring";
import { addAnimatorTransition } from "./animator-transition-authoring";
import { animatorStateMachinePath } from "../domain/animator-state-machine";
import { setAnimatorGraphNodePosition } from "./animator-behavior-map-authoring";

describe("nested Animator state-machine authoring", () => {
  it("authors nested scopes and parent Exit routes immutably", () => {
    const source = addRootState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
    });
    const withAction = addAnimatorStateMachine(source, "base-layer", undefined, {
      id: "action",
      name: "Action",
    });
    const withPhase = addAnimatorStateMachine(withAction, "base-layer", "action", {
      id: "phase",
      name: "Phase",
    });
    const withState = addAnimatorStateToStateMachine(withPhase, "base-layer", "phase", {
      id: "windup",
      name: "Windup",
    });
    const defaulted = setAnimatorStateMachineDefaultNode(
      setAnimatorStateMachineDefaultNode(withState, "base-layer", "action", "phase"),
      "base-layer",
      "phase",
      "windup",
    );
    const withMotion = setAnimatorStateMachineStateMotion(
      defaulted,
      "base-layer",
      "phase",
      "windup",
      { kind: "clip", clipRef: { guid: "a".repeat(32) }, speed: 1 },
    );
    const routed = addAnimatorTransition(
      withMotion,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "state", stateId: "idle" },
      { id: "action-exit" },
    );

    expect(source.layers[0]?.stateMachines).toBeUndefined();
    expect(animatorStateMachinePath(routed.layers[0]!, "phase").map((machine) => machine.id))
      .toEqual(["action", "phase"]);
    expect(routed.layers[0]?.stateMachines?.[0]).toMatchObject({
      id: "action",
      defaultStateId: "phase",
      transitions: [{ id: "action-exit", destination: { kind: "state", stateId: "idle" } }],
      stateMachines: [{
        id: "phase",
        defaultStateId: "windup",
        states: [{ id: "windup", motion: { kind: "clip" } }],
      }],
    });

    const renamed = patchAnimatorStateMachine(routed, "base-layer", "action", { name: "Attack" });
    const withoutState = removeAnimatorStateFromStateMachine(
      renamed,
      "base-layer",
      "phase",
      "windup",
    );
    expect(withoutState.layers[0]?.stateMachines?.[0]?.stateMachines[0]?.defaultStateId).toBe("");
    expect(removeAnimatorStateMachine(withoutState, "base-layer", "action").layers[0]?.stateMachines)
      .toEqual([]);
  });

  it("enforces nesting depth and reconciles synchronized layer structure", () => {
    let controller = addAnimatorLayer(createAnimatorController("controller"), {
      id: "upper",
      name: "Upper",
    });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    let parentId: string | undefined;
    for (let depth = 1; depth <= 8; depth += 1) {
      const id = `machine-${depth}`;
      controller = addAnimatorStateMachine(controller, "base-layer", parentId, { id });
      parentId = id;
    }
    controller = addAnimatorStateToStateMachine(
      controller,
      "base-layer",
      parentId!,
      { id: "deep-state" },
    );

    expect(animatorStateMachinePath(controller.layers[1]!, parentId).map((machine) => machine.id))
      .toHaveLength(8);
    expect(controller.layers[1]?.stateMachines?.[0]?.stateMachines[0]?.id).toBe("machine-2");
    expect(() => addAnimatorStateMachine(controller, "base-layer", parentId, { id: "too-deep" }))
      .toThrow(/cannot exceed depth 8/);
  });

  it("removes graph layouts owned by a deleted machine subtree", () => {
    let controller = addAnimatorStateMachine(
      createAnimatorController("controller"),
      "base-layer",
      undefined,
      { id: "action" },
    );
    controller = addAnimatorStateMachine(controller, "base-layer", "action", { id: "combo" });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "combo", { id: "hit" });
    controller = setAnimatorGraphNodePosition(
      controller,
      "base-layer",
      "state-machine:action",
      [100, 100],
    );
    controller = setAnimatorGraphNodePosition(
      controller,
      "base-layer",
      "state-machine:combo",
      [200, 100],
      "action",
    );
    controller = setAnimatorGraphNodePosition(
      controller,
      "base-layer",
      "state:hit",
      [300, 100],
      "combo",
    );

    const removed = removeAnimatorStateMachine(controller, "base-layer", "action");
    expect(removed.behaviorMap?.layers[0]?.nodes).toEqual([]);
  });
});
