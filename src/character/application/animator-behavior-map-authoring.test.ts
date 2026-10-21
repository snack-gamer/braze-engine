import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import {
  animatorLayerBehaviorMap,
  setAnimatorGraphNodePosition,
} from "./animator-behavior-map-authoring";
import { addAnimatorState, removeAnimatorState } from "./animator-controller-authoring";

describe("Animator Behavior Map authoring", () => {
  it("rejects graph layout for a layer that does not exist", () => {
    expect(() => setAnimatorGraphNodePosition(
      createAnimatorController("controller"), "missing", "entry", [0, 0],
    ))
      .toThrow(/layer 'missing' was not found/);
  });

  it("persists layout without mutating controller graph data", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", { id: "idle", name: "Idle" });
    const source = controller;
    controller = setAnimatorGraphNodePosition(controller, "base-layer", "state:idle", [420, 160]);
    controller = setAnimatorGraphNodePosition(controller, "base-layer", "entry", [-180, -90]);
    expect(source.behaviorMap).toBeUndefined();
    expect(animatorLayerBehaviorMap(controller, "base-layer")).toMatchObject({
      nodes: [
        { id: "state:idle", position: [420, 160] },
        { id: "entry", position: [-180, -90] },
      ],
    });

    const removed = removeAnimatorState(controller, "base-layer", "idle");
    expect(animatorLayerBehaviorMap(removed, "base-layer").nodes)
      .toEqual([{ id: "entry", position: [-180, -90] }]);
  });
});
