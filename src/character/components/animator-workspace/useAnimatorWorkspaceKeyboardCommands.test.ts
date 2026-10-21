import { describe, expect, it } from "vitest";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "../../application/animator-state-machine-authoring";
import {
  addAnimatorLayer,
  setAnimatorLayerSynchronization,
} from "../../application/animator-controller-authoring";
import { createAnimatorController } from "../../domain/animator-controller";
import type { AnimatorWorkspaceSelection } from "./animator-workspace-selection";
import { canDeleteAnimatorWorkspaceSelection } from "./useAnimatorWorkspaceKeyboardCommands";

describe("Animator workspace structural keyboard commands", () => {
  it("blocks inherited state, machine, and transition deletion on synchronized layers", () => {
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
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");

    const selections: AnimatorWorkspaceSelection[] = [{
      kind: "state",
      layerId: "upper",
      stateId: "attack",
    }, {
      kind: "stateMachine",
      layerId: "upper",
      stateMachineId: "combo",
    }, {
      kind: "transition",
      layerId: "upper",
      source: { kind: "state", stateId: "attack" },
      transitionId: "inherited-transition",
    }];

    for (const selection of selections) {
      expect(canDeleteAnimatorWorkspaceSelection(controller, selection)).toBe(false);
      expect(canDeleteAnimatorWorkspaceSelection(
        controller,
        { ...selection, layerId: "base-layer" },
      )).toBe(true);
    }
  });
});
