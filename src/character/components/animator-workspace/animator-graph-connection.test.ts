import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../../domain/animator-controller";
import {
  addAnimatorLayer,
  addAnimatorState,
  setAnimatorLayerSynchronization,
} from "../../application/animator-controller-authoring";
import { buildAnimatorGraphModel } from "../../application/animator-graph-model";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "../../application/animator-state-machine-authoring";
import {
  animatorGraphConnectionSource,
  canBeginAnimatorGraphConnection,
  canCompleteAnimatorGraphConnection,
} from "./animator-graph-connection";
import { addAnimatorTransition } from "../../application/animator-transition-authoring";

describe("Animator graph connection scope", () => {
  it("connects machines in their parent and allows nested states to Exit", () => {
    let controller = createAnimatorController("controller");
    controller = addAnimatorState(controller, "base-layer", { id: "idle" });
    controller = addAnimatorStateMachine(controller, "base-layer", undefined, { id: "action" });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", { id: "attack" });
    const layer = controller.layers[0]!;
    const root = buildAnimatorGraphModel(controller, layer);
    const nested = buildAnimatorGraphModel(controller, layer, "action");
    const machine = root.nodes.find((node) => node.stateMachineId === "action")!;
    const idle = root.nodes.find((node) => node.stateId === "idle")!;
    const attack = nested.nodes.find((node) => node.stateId === "attack")!;
    const nestedExit = nested.nodes.find((node) => node.kind === "exit")!;
    const rootExit = root.nodes.find((node) => node.kind === "exit")!;
    const machineSource = animatorGraphConnectionSource(machine)!;
    const attackSource = animatorGraphConnectionSource(attack)!;

    expect(canBeginAnimatorGraphConnection(layer, machineSource)).toBe(true);
    expect(canCompleteAnimatorGraphConnection(controller, layer, machineSource, machine)).toBe(false);
    expect(canCompleteAnimatorGraphConnection(controller, layer, machineSource, idle)).toBe(true);
    expect(canCompleteAnimatorGraphConnection(
      controller,
      layer,
      attackSource,
      nestedExit,
      "action",
    )).toBe(true);
    expect(canCompleteAnimatorGraphConnection(controller, layer, {
      kind: "state",
      stateId: "idle",
    }, rootExit)).toBe(false);
  });

  it("shows synchronized wiring without enabling structural connection ports", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
    });
    controller = addAnimatorState(controller, "base-layer", { id: "run" });
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "idle" },
      { kind: "state", stateId: "run" },
      { id: "move" },
    );
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    const layer = controller.layers[1]!;
    const graph = buildAnimatorGraphModel(controller, layer);
    const idle = graph.nodes.find((node) => node.stateId === "idle")!;

    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "move", sourceNodeId: "state:idle" }),
    ]));
    expect(canBeginAnimatorGraphConnection(
      layer,
      animatorGraphConnectionSource(idle)!,
    )).toBe(false);
  });
});
