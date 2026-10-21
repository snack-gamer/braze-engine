import { describe, expect, it } from "vitest";
import { createAnimatorController } from "../domain/animator-controller";
import {
  addAnimatorLayer,
  addAnimatorParameter,
  addAnimatorState,
  patchAnimatorParameter,
  patchAnimatorState,
  removeAnimatorLayer,
  removeAnimatorParameter,
  removeAnimatorState,
  setAnimatorDefaultState,
  setAnimatorStateMotion,
  setAnimatorStateClip,
  setAnimatorLayerSynchronization,
} from "./animator-controller-authoring";
import { addAnimatorTransition } from "./animator-transition-authoring";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "./animator-state-machine-authoring";
import {
  MAX_AUTHORED_ANIMATOR_LAYERS,
  MAX_AUTHORED_ANIMATOR_PARAMETERS,
  MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER,
  MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER,
} from "./animator-controller-authoring-limits";

describe("Animator Controller authoring operations", () => {
  it("creates stable layers and states without mutating the source controller", () => {
    const source = createAnimatorController("controller", "Locomotion");
    const withIdle = addAnimatorState(source, "base-layer", { id: "idle", name: "Idle" });
    const withRun = addAnimatorState(withIdle, "base-layer", { id: "run", name: "Run" });
    const withLayer = addAnimatorLayer(withRun, { id: "upper", name: "Upper Body" });

    expect(source.layers[0]?.states).toEqual([]);
    expect(withRun.layers[0]).toMatchObject({ defaultStateId: "idle" });
    expect(withLayer.layers.map((layer) => layer.id)).toEqual(["base-layer", "upper"]);
    expect(removeAnimatorLayer(withLayer, "upper").layers).toHaveLength(1);
    expect(() => removeAnimatorLayer(source, "base-layer")).toThrow(/at least one layer/);
  });

  it("assigns clips, changes the default state, and removes dangling transitions", () => {
    const source = addAnimatorState(
      addAnimatorState(createAnimatorController("controller"), "base-layer", { id: "idle" }),
      "base-layer",
      { id: "run" },
    );
    const withClip = setAnimatorStateClip(source, "base-layer", "run", {
      guid: "a".repeat(32),
      localId: "clip:run",
    });
    const withTransition = addAnimatorTransition(
      withClip,
      "base-layer",
      { kind: "state", stateId: "idle" },
      { kind: "state", stateId: "run" },
      { id: "to-run" },
    );
    const selected = setAnimatorDefaultState(withTransition, "base-layer", "run");
    const removed = removeAnimatorState(selected, "base-layer", "run");

    expect(source.layers[0]?.states[1]?.motion).toBeNull();
    expect(withClip.layers[0]?.states[1]).toMatchObject({
      motion: { kind: "clip", speed: 1 },
      writeDefaults: true,
    });
    expect(removed.layers[0]).toMatchObject({ defaultStateId: "idle" });
    expect(removed.layers[0]?.states[0]?.transitions).toEqual([]);
  });

  it("allows root Entry to target a direct child state machine", () => {
    let controller = createAnimatorController("controller");
    controller = addAnimatorStateMachine(controller, "base-layer", undefined, {
      id: "locomotion",
      name: "Locomotion",
    });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "locomotion", {
      id: "idle",
      name: "Idle",
    });

    const selected = setAnimatorDefaultState(controller, "base-layer", "locomotion");

    expect(selected.layers[0]?.defaultStateId).toBe("locomotion");
    expect(controller.layers[0]?.defaultStateId).toBe("");
    expect(() => setAnimatorDefaultState(selected, "base-layer", "idle")).toThrow(
      /state or state machine 'idle' was not found/,
    );
  });

  it("keeps root node IDs global and prunes machine Exit routes when a state is removed", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
    });
    controller = addAnimatorState(controller, "base-layer", { id: "done" });
    controller = addAnimatorStateMachine(controller, "base-layer", undefined, { id: "action" });
    controller = addAnimatorStateToStateMachine(controller, "base-layer", "action", { id: "windup" });
    controller = addAnimatorTransition(
      controller,
      "base-layer",
      { kind: "stateMachine", stateMachineId: "action" },
      { kind: "state", stateId: "idle" },
      { id: "return-idle" },
    );

    expect(() => addAnimatorState(controller, "base-layer", { id: "windup" })).toThrow(
      /node 'windup' already exists/,
    );
    const removed = removeAnimatorState(controller, "base-layer", "idle");
    expect(removed.layers[0]?.defaultStateId).toBe("done");
    expect(removed.layers[0]?.stateMachines?.[0]?.transitions).toEqual([]);
  });

  it("removes every parameter reference while retaining unrelated authored values", () => {
    let controller = addAnimatorParameter(createAnimatorController("controller"), "float", {
      id: "speed",
      name: "Speed",
    });
    controller = addAnimatorParameter(controller, "boolean", { id: "grounded", name: "Grounded" });
    controller = patchAnimatorParameter(controller, "speed", { defaultValue: 1.25 });
    controller = addAnimatorState(controller, "base-layer", { id: "move", name: "Move" });
    controller = {
      ...controller,
      layers: [{
        ...controller.layers[0]!,
        states: [{
          ...controller.layers[0]!.states[0]!,
          speedParameterId: "speed",
          motion: {
            kind: "blendTree",
            tree: { kind: "1d", parameterId: "speed", children: [] },
          },
          transitions: [{
            id: "transition",
            destination: { kind: "exit" },
            conditions: [
              { parameterId: "speed", mode: "greater", threshold: 0 },
              { parameterId: "grounded", mode: "if" },
            ],
            hasExitTime: false,
            exitTimeNormalized: 0.75,
            durationMode: "normalized",
            duration: 0.25,
            offsetNormalized: 0,
            interruptionSource: "none",
            orderedInterruption: true,
            canTransitionToSelf: false,
          }],
        }],
      }],
    };

    const removed = removeAnimatorParameter(controller, "speed");
    expect(removed.parameters.map((parameter) => parameter.id)).toEqual(["grounded"]);
    expect(removed.layers[0]?.states[0]).toMatchObject({ motion: null });
    expect(removed.layers[0]?.states[0]?.speedParameterId).toBeUndefined();
    expect(removed.layers[0]?.states[0]?.transitions[0]?.conditions).toEqual([
      { parameterId: "grounded", mode: "if" },
    ]);
    expect(controller.layers[0]?.states[0]?.motion).not.toBeNull();
  });

  it("persists supported state timing parameters and full motion documents", () => {
    let controller = addAnimatorState(createAnimatorController("controller"), "base-layer", { id: "move" });
    controller = patchAnimatorState(controller, "base-layer", "move", {
      speed: 1.2,
      speedParameterId: "speed",
      cycleOffset: 0.25,
      cycleOffsetParameterId: "phase",
    });
    const updated = setAnimatorStateMotion(controller, "base-layer", "move", {
      kind: "blendTree",
      tree: { kind: "1d", parameterId: "speed", children: [] },
    });
    expect(updated.layers[0]?.states[0]).toMatchObject({
      speed: 1.2,
      speedParameterId: "speed",
      cycleOffset: 0.25,
      cycleOffsetParameterId: "phase",
      motion: { tree: { kind: "1d" } },
    });
    expect(controller.layers[0]?.states[0]?.motion).toBeNull();
  });

  it("synchronizes state structure while retaining same-ID motion overrides", () => {
    let source = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
    });
    source = addAnimatorState(source, "base-layer", { id: "run", name: "Run" });
    source = addAnimatorLayer(source, { id: "upper", name: "Upper" });
    source = addAnimatorState(source, "upper", { id: "run", name: "Override Run" });
    source = setAnimatorStateClip(source, "upper", "run", {
      guid: "b".repeat(32),
      localId: "upper-run",
    });

    const synchronized = setAnimatorLayerSynchronization(source, "upper", "base-layer", true);

    expect(synchronized.layers[1]).toMatchObject({
      syncedLayerId: "base-layer",
      syncedLayerAffectsTiming: true,
      defaultStateId: "idle",
    });
    expect(synchronized.layers[1]?.states.map((state) => state.id)).toEqual(["idle", "run"]);
    expect(synchronized.layers[1]?.states[1]?.motion).toMatchObject({
      clipRef: { localId: "upper-run" },
    });
    expect(() => addAnimatorState(synchronized, "upper")).toThrow(/inherit/);
  });

  it("prevents authoring past the runtime graph budgets", () => {
    const source = createAnimatorController("controller");
    const parameterFull = {
      ...source,
      parameters: Array.from({ length: MAX_AUTHORED_ANIMATOR_PARAMETERS }, (_, index) => ({
        id: `parameter-${index}`,
        name: `Parameter ${index}`,
        kind: "float" as const,
        defaultValue: 0,
      })),
    };
    const layerFull = {
      ...source,
      layers: Array.from({ length: MAX_AUTHORED_ANIMATOR_LAYERS }, (_, index) => ({
        ...source.layers[0]!,
        id: `layer-${index}`,
      })),
    };
    const stateFull = {
      ...source,
      layers: [{
        ...source.layers[0]!,
        states: Array.from({ length: MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER }, (_, index) => ({
          id: `state-${index}`,
          name: `State ${index}`,
          motion: null,
          speed: 1,
          cycleOffset: 0,
          mirror: false,
          footIk: false,
          writeDefaults: true,
          transitions: [],
          events: [],
        })),
      }],
    };
    const transition = {
      id: "any",
      destination: { kind: "exit" as const },
      conditions: [],
      hasExitTime: false,
      exitTimeNormalized: 0,
      durationMode: "seconds" as const,
      duration: 0,
      offsetNormalized: 0,
      interruptionSource: "none" as const,
      orderedInterruption: true,
      canTransitionToSelf: false,
    };
    const transitionExpansionFull = {
      ...source,
      layers: [{
        ...source.layers[0]!,
        states: stateFull.layers[0]!.states.slice(0, 2),
        anyStateTransitions: Array.from(
          { length: MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER / 2 },
          (_, index) => ({ ...transition, id: `any-${index}` }),
        ),
      }],
    };

    expect(() => addAnimatorParameter(parameterFull, "float")).toThrow(/parameters/);
    expect(() => addAnimatorLayer(layerFull)).toThrow(/layers/);
    expect(() => addAnimatorState(stateFull, "base-layer")).toThrow(/states/);
    expect(() => addAnimatorState(transitionExpansionFull, "base-layer")).toThrow(/compiled transitions/);
  });
});
