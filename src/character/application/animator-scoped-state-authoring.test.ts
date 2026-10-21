import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import { animatorLayerBehaviorMap, setAnimatorGraphNodePosition } from "./animator-behavior-map-authoring";
import { patchAnimatorClipPlayback } from "./animator-clip-authoring";
import {
  patchScopedAnimatorState,
  removeScopedAnimatorState,
} from "./animator-scoped-state-authoring";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
  setAnimatorStateMachineStateClip,
} from "./animator-state-machine-authoring";

describe("scoped Animator state authoring", () => {
  it("edits nested Clip playback and prunes its persisted graph layout", () => {
    let controller = addAnimatorStateMachine(
      createAnimatorController("controller"),
      "base-layer",
      undefined,
      { id: "action" },
    );
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", {
      id: "attack",
    });
    controller = setAnimatorStateMachineStateClip(
      controller,
      "base-layer",
      "action",
      "attack",
      { guid: "a".repeat(32) },
    );
    controller = setAnimatorGraphNodePosition(
      controller,
      "base-layer",
      "state:attack",
      [200, 100],
      "action",
    );
    controller = patchScopedAnimatorState(controller, "base-layer", "attack", {
      name: "Heavy Attack",
      mirror: true,
    });
    controller = patchAnimatorClipPlayback(controller, "base-layer", "attack", {
      speed: 1.5,
      loopMode: "once",
    });

    expect(controller.layers[0]?.stateMachines?.[0]?.states[0]).toMatchObject({
      name: "Heavy Attack",
      mirror: true,
      speed: 1.5,
      motion: { kind: "clip", speed: 1, loopMode: "once" },
    });

    const removed = removeScopedAnimatorState(controller, "base-layer", "attack");
    expect(removed.layers[0]?.stateMachines?.[0]?.states).toEqual([]);
    expect(animatorLayerBehaviorMap(removed, "base-layer").nodes).toEqual([]);
  });
});
