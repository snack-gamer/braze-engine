import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import {
  animatorLayerBehaviorMap,
  setAnimatorGraphNodePosition,
} from "./animator-behavior-map-authoring";
import { addAnimatorState } from "./animator-controller-authoring";
import { removeAnimatorStates } from "./animator-state-selection-authoring";
import { addAnimatorTransition } from "./animator-transition-authoring";

describe("Animator state selection authoring", () => {
  it("deletes multiple selected states and every dangling graph reference atomically", () => {
    let controller = createAnimatorController("controller");
    for (const id of ["idle", "run", "jump"]) {
      controller = addAnimatorState(controller, "base-layer", { id, name: id });
      controller = setAnimatorGraphNodePosition(controller, "base-layer", `state:${id}`, [100, 100]);
    }
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "run" },
      { kind: "state", stateId: "jump" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "anyState" },
      { kind: "state", stateId: "idle" },
    );
    const removed = removeAnimatorStates(controller, "base-layer", ["jump", "idle"]);
    const layer = removed.layers[0]!;
    const map = animatorLayerBehaviorMap(removed, layer.id);

    expect(layer.defaultStateId).toBe("run");
    expect(layer.states).toMatchObject([{ id: "run", transitions: [] }]);
    expect(layer.anyStateTransitions).toEqual([]);
    expect(map.nodes).toEqual([{ id: "state:run", position: [100, 100] }]);
  });

  it("rejects stale state ids without changing the source controller", () => {
    const source = addAnimatorState(createAnimatorController("controller"), "base-layer", { id: "idle" });
    expect(() => removeAnimatorStates(source, "base-layer", ["idle", "missing"]))
      .toThrow(/state that was not found/);
    expect(source.layers[0]?.states.map((state) => state.id)).toEqual(["idle"]);
  });
});
