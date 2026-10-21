import { describe, expect, it } from "vitest";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
  removeAnimatorStateMachine,
} from "../../application/animator-state-machine-authoring";
import {
  addAnimatorLayer,
  setAnimatorLayerSynchronization,
} from "../../application/animator-controller-authoring";
import { addAnimatorTransition } from "../../application/animator-transition-authoring";
import { createAnimatorController } from "../../domain/animator-controller";
import {
  reconcileAnimatorWorkspaceSelection,
  selectedAnimatorStateIds,
  type AnimatorWorkspaceSelection,
} from "./animator-workspace-selection";

describe("Animator workspace selection", () => {
  it("keeps a selected Blend Tree motion out of state-level delete commands", () => {
    expect(selectedAnimatorStateIds({
      kind: "state",
      layerId: "base-layer",
      stateId: "locomotion",
      isolated: true,
      blendChildId: "idle",
    })).toEqual([]);
  });

  it("preserves a current nested scope without making its node deletable", () => {
    const controller = addAnimatorStateMachine(
      createAnimatorController("controller"),
      "base-layer",
      undefined,
      { id: "combo", name: "Combo" },
    );
    const scope: AnimatorWorkspaceSelection = {
      kind: "scope",
      layerId: "base-layer",
      stateMachineId: "combo",
    };

    expect(reconcileAnimatorWorkspaceSelection(controller, scope)).toBe(scope);

    const withoutMachine = removeAnimatorStateMachine(controller, "base-layer", "combo");
    expect(reconcileAnimatorWorkspaceSelection(withoutMachine, scope)).toEqual({
      kind: "layer",
      layerId: "base-layer",
    });
  });

  it("preserves inherited nested-transition selection on a synchronized layer", () => {
    let controller = addAnimatorStateMachine(
      createAnimatorController("controller"),
      "base-layer",
      undefined,
      { id: "combo", name: "Combo" },
    );
    controller = addAnimatorStateToStateMachine(
      controller,
      "base-layer",
      "combo",
      { id: "attack", name: "Attack" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "attack" },
      { kind: "exit" },
      { id: "finish" },
    );
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    const selection: AnimatorWorkspaceSelection = {
      kind: "transition",
      layerId: "upper",
      source: { kind: "state", stateId: "attack" },
      transitionId: "finish",
    };

    expect(controller.layers[1]?.stateMachines?.[0]?.states[0]?.transitions).toEqual([]);
    expect(reconcileAnimatorWorkspaceSelection(controller, selection)).toBe(selection);
  });
});
