import { describe, expect, it } from "vitest";
import { createAnimatorController, type AnimatorTransition } from "../domain/animator-controller";
import {
  ANIMATOR_GRAPH_NODE_IDS,
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../domain/animator-behavior-map";
import { findAnimatorState } from "../domain/animator-state-machine";
import {
  animatorLayerBehaviorMap,
  setAnimatorGraphNodePosition,
} from "./animator-behavior-map-authoring";
import {
  addAnimatorLayer,
  addAnimatorState,
  patchAnimatorState,
  removeAnimatorState,
  setAnimatorDefaultState,
  setAnimatorLayerSynchronization,
  setAnimatorStateClip,
} from "./animator-controller-authoring";
import {
  addAnimatorTransition,
  patchAnimatorTransition,
  removeAnimatorTransition,
} from "./animator-transition-authoring";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
  patchAnimatorStateInStateMachine,
  removeAnimatorStateFromStateMachine,
  setAnimatorStateMachineDefaultNode,
  setAnimatorStateMachineStateClip,
} from "./animator-state-machine-authoring";

const CLIP_GUID = "c".repeat(32);

describe("synchronized Animator layer authoring", () => {
  it("reconciles transitive state structure while preserving same-ID overrides", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
    });
    controller = addAnimatorState(controller, "base-layer", { id: "run", name: "Run" });
    controller = setAnimatorStateClip(controller, "base-layer", "run", clip("base-run"));
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = addAnimatorState(controller, "upper", { id: "run", name: "Upper Run" });
    controller = setAnimatorStateClip(controller, "upper", "run", clip("upper-run"));
    controller = patchAnimatorState(controller, "upper", "run", { mirror: true, footIk: true });
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer", true);
    controller = addAnimatorLayer(controller, { id: "effects", name: "Effects" });
    controller = addAnimatorState(controller, "effects", { id: "run", name: "Effects Run" });
    controller = setAnimatorStateClip(controller, "effects", "run", clip("effects-run"));
    controller = patchAnimatorState(controller, "effects", "run", { writeDefaults: false });
    controller = setAnimatorLayerSynchronization(controller, "effects", "upper");
    controller = setAnimatorDefaultState(controller, "base-layer", "run");
    for (const layerId of ["upper", "effects"]) {
      controller = setAnimatorGraphNodePosition(controller, layerId, "state:run", [300, 100]);
    }

    controller = addAnimatorState(controller, "base-layer", { id: "jump", name: "Jump" });
    const expanded = setAnimatorStateClip(controller, "base-layer", "jump", clip("base-jump"));

    expect(expanded.layers.map((layer) => ({
      id: layer.id,
      defaultStateId: layer.defaultStateId,
      stateIds: layer.states.map((state) => state.id),
    }))).toEqual([
      { id: "base-layer", defaultStateId: "run", stateIds: ["idle", "run", "jump"] },
      { id: "upper", defaultStateId: "run", stateIds: ["idle", "run", "jump"] },
      { id: "effects", defaultStateId: "run", stateIds: ["idle", "run", "jump"] },
    ]);
    expect(expanded.layers[1]?.states.find((state) => state.id === "run")).toMatchObject({
      motion: { clipRef: { localId: "upper-run" } },
      mirror: true,
      footIk: true,
    });
    expect(expanded.layers[2]?.states.find((state) => state.id === "run")).toMatchObject({
      motion: { clipRef: { localId: "effects-run" } },
      writeDefaults: false,
    });
    expect(expanded.layers[1]?.states.find((state) => state.id === "jump")?.motion)
      .toMatchObject({ clipRef: { localId: "base-jump" } });
    expect(expanded.layers[2]?.states.find((state) => state.id === "jump")?.motion)
      .toMatchObject({ clipRef: { localId: "base-jump" } });

    const removed = removeAnimatorState(expanded, "base-layer", "run");
    expect(removed.layers.map((layer) => ({
      defaultStateId: layer.defaultStateId,
      stateIds: layer.states.map((state) => state.id),
    }))).toEqual([
      { defaultStateId: "idle", stateIds: ["idle", "jump"] },
      { defaultStateId: "idle", stateIds: ["idle", "jump"] },
      { defaultStateId: "idle", stateIds: ["idle", "jump"] },
    ]);
    for (const layerId of ["upper", "effects"]) {
      expect(animatorLayerBehaviorMap(removed, layerId).nodes.map((node) => node.id))
        .not.toContain("state:run");
    }
  });

  it("rejects default and transition mutations on an inherited state machine", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
    });
    controller = addAnimatorState(controller, "base-layer", { id: "run" });
    controller = addAnimatorLayer(controller, { id: "upper" });
    expect(() => setAnimatorLayerSynchronization(controller, "base-layer", "upper"))
      .toThrow(/base Animator layer/);
    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");

    expect(() => setAnimatorDefaultState(controller, "upper", "run")).toThrow(/inherit/);
    expect(() => addAnimatorTransition(
      controller,
      "upper",
      { kind: "state", stateId: "idle" },
      { kind: "state", stateId: "run" },
    )).toThrow(/inherit/);

    const staleTransition = transition("stale", "run");
    const stale = {
      ...controller,
      layers: controller.layers.map((layer) => layer.id === "upper" ? {
        ...layer,
        states: layer.states.map((state) => state.id === "idle"
          ? { ...state, transitions: [staleTransition] }
          : state),
      } : layer),
    };
    expect(() => patchAnimatorTransition(
      stale,
      "upper",
      { kind: "state", stateId: "idle" },
      "stale",
      { duration: 0.5 },
    )).toThrow(/inherit/);
    expect(() => removeAnimatorTransition(
      stale,
      "upper",
      { kind: "state", stateId: "idle" },
      "stale",
    )).toThrow(/inherit/);
  });

  it("preserves valid scoped layouts and nested state overrides while pruning stale scopes", () => {
    let controller = createAnimatorController("controller");
    for (const layerId of ["base-layer"] as const) {
      controller = addAnimatorStateMachine(controller, layerId, undefined, { id: "action" });
      controller = addAnimatorStateToStateMachine(controller, layerId, "action", { id: "attack" });
      controller = addAnimatorStateMachine(controller, layerId, "action", { id: "phase" });
      controller = addAnimatorStateToStateMachine(controller, layerId, "phase", { id: "windup" });
    }
    controller = addAnimatorLayer(controller, { id: "upper", name: "Upper" });
    controller = addAnimatorStateMachine(controller, "upper", undefined, { id: "action" });
    controller = addAnimatorStateToStateMachine(controller, "upper", "action", { id: "attack" });
    controller = addAnimatorStateToStateMachine(controller, "upper", "action", { id: "stale-action" });
    controller = addAnimatorStateMachine(controller, "upper", "action", { id: "phase" });
    controller = addAnimatorStateToStateMachine(controller, "upper", "phase", { id: "windup" });
    controller = addAnimatorStateMachine(controller, "upper", undefined, { id: "obsolete" });
    controller = addAnimatorStateToStateMachine(controller, "upper", "obsolete", { id: "stale" });

    const layouts = [
      [ANIMATOR_GRAPH_NODE_IDS.entry, undefined],
      [animatorStateMachineNodeId("action"), undefined],
      [ANIMATOR_GRAPH_NODE_IDS.entry, "action"],
      [animatorStateNodeId("attack"), "action"],
      [animatorStateMachineNodeId("phase"), "action"],
      [ANIMATOR_GRAPH_NODE_IDS.exit, "phase"],
      [animatorStateNodeId("windup"), "phase"],
      [animatorStateNodeId("stale-action"), "action"],
      [animatorStateMachineNodeId("obsolete"), undefined],
      [ANIMATOR_GRAPH_NODE_IDS.anyState, "obsolete"],
      [animatorStateNodeId("stale"), "obsolete"],
    ] as const;
    layouts.forEach(([nodeId, stateMachineId], index) => {
      controller = setAnimatorGraphNodePosition(
        controller,
        "upper",
        nodeId,
        [index * 10, index * 5],
        stateMachineId,
      );
    });

    controller = setAnimatorLayerSynchronization(controller, "upper", "base-layer");
    expect(animatorLayerBehaviorMap(controller, "upper").nodes.map((node) => [
      node.id,
      node.stateMachineId,
    ])).toEqual(layouts.slice(0, 7));

    controller = setAnimatorStateMachineStateClip(
      controller,
      "upper",
      "phase",
      "windup",
      clip("upper-windup"),
    );
    controller = patchAnimatorStateInStateMachine(
      controller,
      "upper",
      "phase",
      "windup",
      { mirror: true },
    );
    controller = setAnimatorStateMachineStateClip(
      controller,
      "base-layer",
      "phase",
      "windup",
      clip("base-windup"),
    );
    expect(findAnimatorState(controller.layers[1]!, "windup")?.state).toMatchObject({
      mirror: true,
      motion: { clipRef: { localId: "upper-windup" } },
    });

    expect(() => addAnimatorStateToStateMachine(
      controller,
      "upper",
      "phase",
      { id: "blocked" },
    )).toThrow(/inherit/);
    expect(() => removeAnimatorStateFromStateMachine(
      controller,
      "upper",
      "phase",
      "windup",
    )).toThrow(/inherit/);
    expect(() => setAnimatorStateMachineDefaultNode(
      controller,
      "upper",
      "phase",
      "windup",
    )).toThrow(/inherit/);
  });
});

function clip(localId: string) {
  return { guid: CLIP_GUID, localId };
}

function transition(id: string, destinationStateId: string): AnimatorTransition {
  return {
    id,
    destination: { kind: "state", stateId: destinationStateId },
    conditions: [],
    hasExitTime: true,
    exitTimeNormalized: 0.75,
    durationMode: "normalized",
    duration: 0.25,
    offsetNormalized: 0,
    interruptionSource: "none",
    orderedInterruption: true,
    canTransitionToSelf: false,
  };
}
