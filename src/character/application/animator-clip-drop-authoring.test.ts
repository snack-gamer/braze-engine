import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import { animatorLayerBehaviorMap } from "./animator-behavior-map-authoring";
import { buildAnimatorGraphModel } from "./animator-graph-model";
import { addAnimatorClipStateAtPosition } from "./animator-clip-drop-authoring";
import { addAnimatorState } from "./animator-controller-authoring";
import { addAnimatorStateMachine } from "./animator-state-machine-authoring";

const CLIP_REF = { guid: "a".repeat(32), localId: "clip:idle" } as const;

describe("Animator Clip graph placement", () => {
  it("creates a positioned Clip state without authoring any connection", () => {
    const source = createAnimatorController("controller");
    const result = addAnimatorClipStateAtPosition(source, "base-layer", {
      stateId: "idle",
      name: "Idle",
      clipRef: CLIP_REF,
      position: [420, -80],
    });
    const layer = result.controller.layers[0]!;

    expect(source.layers[0]?.states).toEqual([]);
    expect(layer.defaultStateId).toBe("");
    expect(layer.anyStateTransitions).toEqual([]);
    expect(layer.states).toMatchObject([{
      id: "idle",
      name: "Idle",
      motion: { kind: "clip", clipRef: CLIP_REF },
      transitions: [],
    }]);
    expect(animatorLayerBehaviorMap(result.controller, layer.id).nodes)
      .toContainEqual({ id: "state:idle", position: [420, -80] });
    expect(buildAnimatorGraphModel(result.controller, layer).edges).toEqual([]);
  });

  it("leaves an existing Entry assignment and transition graph unchanged", () => {
    const source = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
    });
    const result = addAnimatorClipStateAtPosition(source, "base-layer", {
      stateId: "run",
      name: "Run",
      clipRef: { ...CLIP_REF, localId: "clip:run" },
      position: [600, 140],
    });
    const layer = result.controller.layers[0]!;

    expect(layer.defaultStateId).toBe("idle");
    expect(layer.states.map((state) => state.transitions)).toEqual([[], []]);
    expect(buildAnimatorGraphModel(result.controller, layer).edges).toMatchObject([{
      kind: "entry",
      destinationNodeId: "state:idle",
    }]);
  });

  it("gives repeated Clip drops distinct graph and accessible labels", () => {
    const source = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
    });
    const result = addAnimatorClipStateAtPosition(source, "base-layer", {
      stateId: "idle-copy",
      name: "Idle",
      clipRef: CLIP_REF,
      position: [500, 200],
    });

    expect(result.controller.layers[0]?.states.map((state) => state.name))
      .toEqual(["Idle", "Idle 2"]);
  });

  it("drops a Clip into the open nested state-machine scope", () => {
    const source = addAnimatorStateMachine(
      createAnimatorController("controller"),
      "base-layer",
      undefined,
      { id: "locomotion" },
    );
    const result = addAnimatorClipStateAtPosition(source, "base-layer", {
      stateId: "walk",
      name: "Walk",
      clipRef: CLIP_REF,
      position: [240, 160],
    }, "locomotion");
    const layer = result.controller.layers[0]!;

    expect(layer.states).toEqual([]);
    expect(layer.stateMachines?.[0]).toMatchObject({
      id: "locomotion",
      defaultStateId: "",
      states: [{ id: "walk", motion: { kind: "clip", clipRef: CLIP_REF } }],
    });
    expect(animatorLayerBehaviorMap(result.controller, layer.id).nodes).toContainEqual({
      id: "state:walk",
      position: [240, 160],
      stateMachineId: "locomotion",
    });
    expect(buildAnimatorGraphModel(result.controller, layer, "locomotion").edges).toEqual([]);
  });
});
