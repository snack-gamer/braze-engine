import { describe, expect, it } from "vitest";
import { createAnimatorController, createAnimatorState } from "../domain/animator-controller";
import { setAnimatorGraphNodePosition } from "./animator-behavior-map-authoring";
import {
  addAnimatorLayer,
  addAnimatorState,
  setAnimatorDefaultState,
  setAnimatorLayerSynchronization,
  setAnimatorStateClip,
} from "./animator-controller-authoring";
import { autoArrangeAnimatorGraph } from "./animator-graph-layout";
import { animatorGraphNodeSize, buildAnimatorGraphModel } from "./animator-graph-model";
import { addAnimatorTransition } from "./animator-transition-authoring";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "./animator-state-machine-authoring";

describe("Animator graph model", () => {
  it("derives stable nodes, transition edges, and content bounds", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", { id: "idle", name: "Idle" });
    controller = addAnimatorState(controller, "base-layer", { id: "run", name: "Run" });
    controller = addAnimatorTransition(controller, "base-layer", { kind: "state", stateId: "idle" }, { kind: "state", stateId: "run" }, { id: "move" });
    controller = setAnimatorGraphNodePosition(controller, "base-layer", "state:idle", [300, 100]);
    const graph = buildAnimatorGraphModel(controller, controller.layers[0]!);

    expect(graph.nodes.find((node) => node.stateId === "idle")).toMatchObject({ x: 300, y: 100, defaultState: true });
    expect(graph.nodes.map((node) => node.kind)).toEqual(["entry", "anyState", "exit", "state", "state"]);
    expect(animatorGraphNodeSize(graph.nodes.find((node) => node.kind === "entry")!)).toEqual({ width: 184, height: 48 });
    expect(animatorGraphNodeSize(graph.nodes.find((node) => node.kind === "state")!)).toEqual({ width: 184, height: 64 });
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "entry", destinationNodeId: "state:idle" }),
      expect.objectContaining({ id: "move", sourceNodeId: "state:idle", destinationNodeId: "state:run" }),
    ]));
    expect(graph.bounds).toEqual({ x: 72, y: 90, width: 902, height: 234 });
    expect(graph.extent).toEqual({ width: 974, height: 324 });
  });

  it("shares one collision-free default policy with Auto Arrange", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", { id: "idle", name: "Idle" });
    controller = addAnimatorState(controller, "base-layer", { id: "run", name: "Run" });
    const layer = controller.layers[0]!;
    const graph = buildAnimatorGraphModel(autoArrangeAnimatorGraph(controller, layer), layer);

    expect(graph.nodes.find((node) => node.kind === "entry")).toMatchObject({ x: 72, y: 120 });
    expect(graph.nodes.find((node) => node.kind === "anyState")).toMatchObject({ x: 72, y: 260 });
    expect(graph.nodes.find((node) => node.stateId === "idle")).toMatchObject({ x: 330, y: 90 });
    expect(graph.nodes.find((node) => node.stateId === "run")).toMatchObject({ x: 560, y: 90 });
    expect(graph.nodes.find((node) => node.kind === "exit")).toMatchObject({ x: 790, y: 120 });
  });

  it("exposes distinct Clip and Blend Tree motion identities", () => {
    const source = createAnimatorController("controller");
    const clip = createAnimatorState("idle", "Idle");
    clip.motion = {
      kind: "clip",
      clipRef: { guid: "a".repeat(32), localId: "clip:idle" },
      speed: 1,
    };
    const blend = createAnimatorState("move", "Movement");
    blend.motion = {
      kind: "blendTree",
      tree: { kind: "1d", parameterId: "speed", children: [] },
    };
    const layer = { ...source.layers[0]!, defaultStateId: clip.id, states: [clip, blend] };
    const graph = buildAnimatorGraphModel({ ...source, layers: [layer] }, layer);

    expect(graph.nodes.find((node) => node.stateId === clip.id)).toMatchObject({
      motionKind: "clip",
      subtitle: "Clip",
    });
    expect(graph.nodes.find((node) => node.stateId === blend.id)).toMatchObject({
      motionKind: "blendTree1d",
      subtitle: "Blend Tree",
    });
  });

  it("projects one machine scope at a time with drill-in Entry and Exit", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
    });
    controller = addAnimatorStateMachine(controller, "base-layer", undefined, {
      id: "action",
      name: "Action",
    });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", {
      id: "attack",
      name: "Attack",
    });
    controller = setAnimatorDefaultState(controller, "base-layer", "action");
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "attack" },
      { kind: "exit" },
      { id: "finish-attack" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "state", stateId: "idle" },
      { id: "return-idle" },
    );
    const layer = controller.layers[0]!;
    const root = buildAnimatorGraphModel(controller, layer);
    const nested = buildAnimatorGraphModel(controller, layer, "action");

    expect(root.nodes.find((node) => node.stateMachineId === "action")).toMatchObject({
      kind: "stateMachine",
      label: "Action",
      defaultState: true,
    });
    expect(root.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "entry", destinationNodeId: "state-machine:action" }),
      expect.objectContaining({
        id: "return-idle",
        sourceNodeId: "state-machine:action",
        destinationNodeId: "state:idle",
      }),
    ]));
    expect(nested.nodes.find((node) => node.stateId === "attack")).toMatchObject({
      defaultState: true,
    });
    expect(nested.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "entry", destinationNodeId: "state:attack" }),
      expect.objectContaining({
        id: "finish-attack",
        sourceNodeId: "state:attack",
        destinationNodeId: "exit",
      }),
    ]));
  });

  it("projects inherited transition scopes through synchronized layer chains", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
    });
    controller = addAnimatorState(controller, "base-layer", { id: "run", name: "Run" });
    controller = addAnimatorStateMachine(controller, "base-layer", undefined, {
      id: "action",
      name: "Action",
    });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", {
      id: "attack",
      name: "Attack",
    });
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "idle" },
      { kind: "state", stateId: "run" },
      { id: "move" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "anyState" },
      { kind: "stateMachine", stateMachineId: "action" },
      { id: "root-reaction" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "state", stateId: "attack" },
      { kind: "exit" },
      { id: "finish-attack" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "anyState", stateMachineId: "action" },
      { kind: "state", stateId: "attack" },
      { id: "nested-reaction" },
    );
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "state", stateId: "idle" },
      { id: "return-idle" },
    );
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    controller = addAnimatorLayer(controller, { id: "effects", name: "Effects" });
    controller = setAnimatorLayerSynchronization(controller, "effects", "upper");
    controller = setAnimatorStateClip(controller, "effects", "idle", {
      guid: "c".repeat(32),
      localId: "clip:effects-idle",
    });
    controller = setAnimatorGraphNodePosition(
      controller,
      "effects",
      "state:idle",
      [444, 123],
    );

    const layer = controller.layers[2]!;
    expect(layer.states.flatMap((state) => state.transitions)).toEqual([]);
    expect(layer.stateMachines?.[0]?.states.flatMap((state) => state.transitions)).toEqual([]);
    const root = buildAnimatorGraphModel(controller, layer);
    const nested = buildAnimatorGraphModel(controller, layer, "action");

    expect(root.nodes.find((node) => node.stateId === "idle")).toMatchObject({
      x: 444,
      y: 123,
      subtitle: "Clip",
    });
    expect(root.edges.filter((edge) => edge.kind === "transition").map((edge) => edge.id).sort())
      .toEqual(["move", "return-idle", "root-reaction"]);
    expect(nested.edges.filter((edge) => edge.kind === "transition").map((edge) => edge.id).sort())
      .toEqual(["finish-attack", "nested-reaction"]);
  });
});
