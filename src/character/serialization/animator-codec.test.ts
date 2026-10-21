import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANIMATOR_COMPONENT,
  createDefaultAnimatorComponent,
} from "../domain/animator-component";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { createAnimatorController } from "../domain/animator-controller";
import {
  addAnimatorState,
  setAnimatorDefaultState,
} from "../application/animator-controller-authoring";
import {
  addAnimatorStateMachine,
  addAnimatorStateToStateMachine,
} from "../application/animator-state-machine-authoring";
import { CharacterCodecError } from "./character-codec-values";
import { decodeAnimatorComponent, encodeAnimatorComponent } from "./animator-component-codec";
import { decodeAnimatorController, encodeAnimatorController } from "./animator-controller-codec";

const CLIP_GUID = "6".repeat(32);
const MASK_GUID = "7".repeat(32);
const CONTROLLER_GUID = "8".repeat(32);
const AVATAR_GUID = "9".repeat(32);

function controllerDocument() {
  return {
    id: "controller:locomotion",
    name: "Locomotion",
    parameters: [
      { id: "speed", name: "Speed", kind: "float", default_value: 0 },
      { id: "grounded", name: "Grounded", kind: "boolean", default_value: true },
      { id: "jump", name: "Jump", kind: "trigger", default_value: true },
    ],
    layers: [{
      id: "base",
      name: "Base Layer",
      weight: 1,
      avatar_mask_ref: { guid: MASK_GUID, local_id: "mask:body" },
      default_state_id: "locomotion",
      states: [
        {
          id: "locomotion",
          name: "Locomotion",
          motion: {
            kind: "blendTree",
            tree: {
              kind: "1d",
              parameter_id: "speed",
              children: [
                {
                  id: "idle",
                  threshold: 0,
                  time_scale: 1,
                  motion: { kind: "clip", clip_ref: { guid: CLIP_GUID, local_id: "clip:Idle" }, speed: 1 },
                },
                {
                  id: "run",
                  threshold: 1,
                  time_scale: 1,
                  motion: { kind: "clip", clip_ref: { guid: CLIP_GUID, local_id: "clip:Run" }, speed: 1 },
                },
              ],
            },
          },
          transitions: [{
            id: "to-jump",
            destination_state_id: "jumping",
            conditions: [{ parameter_id: "jump", mode: "triggered" }],
            duration: 0.1,
          }],
          events: [{ id: "ready", name: "Ready", time_normalized: 2, payload: { active: true } }],
        },
        {
          id: "jumping",
          name: "Jumping",
          motion: { kind: "clip", clip_ref: { guid: CLIP_GUID, local_id: "clip:Jump" }, speed: 1 },
          transitions: [{
            id: "land",
            destination: { kind: "state", state_id: "locomotion" },
            conditions: [{ parameter_id: "grounded", mode: "if" }],
            has_exit_time: true,
          }],
        },
      ],
      any_state_transitions: [],
    }],
  };
}

describe("Animator codecs", () => {
  it("round-trips nested machines and preserves flat legacy layers", () => {
    const document = controllerDocument();
    const layer = document.layers[0] as Record<string, unknown>;
    layer.stateMachines = [{
      id: "action",
      name: "Action",
      defaultStateId: "windup",
      states: [{ id: "windup", name: "Windup", transitions: [{
        id: "leave-action",
        destination: { kind: "exit" },
      }] }],
      stateMachines: [],
      anyStateTransitions: [],
      transitions: [{
        id: "action-done",
        destination: { kind: "state", stateId: "locomotion" },
        conditions: [{ parameterId: "grounded", mode: "if" }],
      }],
    }];
    const firstState = document.layers[0]!.states[0] as Record<string, unknown>;
    firstState.transitions = [{
      id: "enter-action",
      destination: { kind: "stateMachine", stateMachineId: "action" },
    }];
    Object.assign(document, {
      behaviorMap: {
        layers: [{
          layerId: "base",
          nodes: [
            { id: "state-machine:action", position: [320, 120] },
            { id: "state:windup", stateMachineId: "action", position: [460, 180] },
            { id: "state:stale", stateMachineId: "action", position: [0, 0] },
          ],
        }],
      },
    });

    const decoded = decodeAnimatorController(document);
    expect(decoded.layers[0]?.stateMachines?.[0]).toMatchObject({
      id: "action",
      defaultStateId: "windup",
      transitions: [{ destination: { kind: "state", stateId: "locomotion" } }],
    });
    expect(decoded.layers[0]?.states[0]?.transitions[0]?.destination).toEqual({
      kind: "stateMachine",
      stateMachineId: "action",
    });
    expect(decoded.behaviorMap?.layers[0]?.nodes).toEqual([
      { id: "state-machine:action", position: [320, 120] },
      { id: "state:windup", stateMachineId: "action", position: [460, 180] },
    ]);
    expect(decodeAnimatorController(encodeAnimatorController(decoded))).toEqual(decoded);

    const legacy = decodeAnimatorController(controllerDocument());
    expect(legacy.layers[0]).not.toHaveProperty("stateMachines");
  });

  it("rejects cyclic and dangling nested state-machine documents", () => {
    const source = createAnimatorController("controller");
    const cyclic = {
      id: "cycle",
      name: "Cycle",
      defaultStateId: "",
      states: [],
      stateMachines: [] as NonNullable<typeof source.layers[0]["stateMachines"]>,
      anyStateTransitions: [],
      transitions: [],
    };
    cyclic.stateMachines.push(cyclic);
    source.layers[0]!.stateMachines = [cyclic];
    expect(() => encodeAnimatorController(source)).toThrowError(CharacterCodecError);

    const dangling = controllerDocument();
    Object.assign(dangling.layers[0]!, {
      stateMachines: [{
        id: "action",
        name: "Action",
        defaultStateId: "missing",
        states: [],
        stateMachines: [],
        anyStateTransitions: [],
        transitions: [],
      }],
    });
    expect(() => decodeAnimatorController(dangling)).toThrowError(CharacterCodecError);
  });

  it("rejects layer-global duplicate transition IDs across nested arrays", () => {
    const duplicate = controllerDocument();
    Object.assign(duplicate.layers[0]!, {
      stateMachines: [{
        id: "action",
        name: "Action",
        defaultStateId: "wave",
        states: [{ id: "wave", name: "Wave", transitions: [] }],
        stateMachines: [],
        anyStateTransitions: [],
        transitions: [{
          id: "to-jump",
          destination: { kind: "state", stateId: "locomotion" },
        }],
      }],
    });

    expect(() => decodeAnimatorController(duplicate)).toThrow(/duplicate transition id to-jump/);

    const generated = controllerDocument();
    delete (generated.layers[0]!.states[0]!.transitions[0] as { id?: string }).id;
    delete (generated.layers[0]!.states[1]!.transitions[0] as { id?: string }).id;
    const decoded = decodeAnimatorController(generated);
    expect(decoded.layers[0]?.states.flatMap((state) => state.transitions.map((item) => item.id)))
      .toEqual([
        "transition:layers[0].states[0].transitions[0]",
        "transition:layers[0].states[1].transitions[0]",
      ]);
  });

  it("rejects recursive Exit expansion and combined conditions before decode", () => {
    const transition = (
      id: string,
      destination: { kind: "exit" } | { kind: "state"; stateId: string },
      conditionCount = 0,
    ) => ({
      id,
      destination,
      conditions: Array.from(
        { length: conditionCount },
        () => ({ parameterId: "grounded", mode: "if" }),
      ),
    });
    const routes = (scope: string, destination: "exit" | "locomotion") => Array.from(
      { length: 8 },
      (_, index) => transition(
        `${scope}-route-${index}`,
        destination === "exit"
          ? { kind: "exit" }
          : { kind: "state", stateId: "locomotion" },
      ),
    );
    const branching = controllerDocument();
    Object.assign(branching.layers[0]!, {
      stateMachines: [{
        id: "machine-1", name: "Machine 1", defaultStateId: "machine-2", states: [],
        anyStateTransitions: [], transitions: routes("machine-1", "locomotion"), stateMachines: [{
          id: "machine-2", name: "Machine 2", defaultStateId: "machine-3", states: [],
          anyStateTransitions: [], transitions: routes("machine-2", "exit"), stateMachines: [{
            id: "machine-3", name: "Machine 3", defaultStateId: "machine-4", states: [],
            anyStateTransitions: [], transitions: routes("machine-3", "exit"), stateMachines: [{
              id: "machine-4", name: "Machine 4", defaultStateId: "leaf",
              states: [{
                id: "leaf", name: "Leaf",
                transitions: [transition("leaf-exit", { kind: "exit" })],
              }],
              stateMachines: [], anyStateTransitions: [], transitions: routes("machine-4", "exit"),
            }],
          }],
        }],
      }],
    });
    expect(() => decodeAnimatorController(branching)).toThrow(/2048 authored or compiled entries/);

    const conditioned = controllerDocument();
    Object.assign(conditioned.layers[0]!, {
      stateMachines: [{
        id: "action", name: "Action", defaultStateId: "leaf",
        states: [{
          id: "leaf", name: "Leaf",
          transitions: [transition("leaf-exit", { kind: "exit" }, 8)],
        }],
        stateMachines: [], anyStateTransitions: [],
        transitions: [transition(
          "action-route",
          { kind: "state", stateId: "locomotion" },
          9,
        )],
      }],
    });
    expect(() => decodeAnimatorController(conditioned)).toThrow(/16 combined conditions/);
  });

  it("migrates and round-trips controllers with states, events, transitions, and blend trees", () => {
    const decoded = decodeAnimatorController(controllerDocument());
    expect(decoded.parameters[2]).toMatchObject({ kind: "trigger", defaultValue: false });
    expect(decoded.layers[0]?.avatarMaskRef).toEqual({ guid: MASK_GUID, localId: "mask:body" });
    expect(decoded.layers[0]?.states[0]?.motion).toMatchObject({
      kind: "blendTree",
      tree: { kind: "1d", parameterId: "speed" },
    });
    expect(decoded.layers[0]?.states[0]?.events[0]?.timeNormalized).toBe(1);
    expect(decodeAnimatorController(encodeAnimatorController(decoded))).toEqual(decoded);
  });

  it("preserves an explicitly unwired Entry while legacy documents still adopt their first state", () => {
    const unwired = addAnimatorState(createAnimatorController("controller"), "base-layer", {
      id: "idle",
      name: "Idle",
      makeDefault: false,
    });
    expect(decodeAnimatorController(encodeAnimatorController(unwired)).layers[0]?.defaultStateId)
      .toBe("");

    const legacy = encodeAnimatorController(unwired);
    delete (legacy.layers[0] as { defaultStateId?: string }).defaultStateId;
    expect(decodeAnimatorController(legacy).layers[0]?.defaultStateId).toBe("idle");

    let nested = addAnimatorStateMachine(createAnimatorController("nested"), "base-layer", undefined, {
      id: "movement",
    });
    nested = addAnimatorStateToStateMachine(nested, "base-layer", "movement", { id: "nested-idle" });
    nested = setAnimatorDefaultState(nested, "base-layer", "movement");
    const missingNestedEntry = encodeAnimatorController(nested);
    delete (missingNestedEntry.layers[0] as { defaultStateId?: string }).defaultStateId;
    expect(decodeAnimatorController(missingNestedEntry).layers[0]?.defaultStateId).toBe("movement");
  });

  it("rejects dangling transition and condition references", () => {
    const missingState = controllerDocument();
    const stateTransition = missingState.layers[0]!.states[0]!.transitions[0] as { destination_state_id: string };
    stateTransition.destination_state_id = "missing";
    expect(() => decodeAnimatorController(missingState)).toThrowError(CharacterCodecError);

    const missingParameter = controllerDocument();
    const parameterCondition = missingParameter.layers[0]!.states[0]!.transitions[0]!.conditions[0] as {
      parameter_id: string;
    };
    parameterCondition.parameter_id = "missing";
    expect(() => decodeAnimatorController(missingParameter)).toThrowError(CharacterCodecError);
  });

  it("provides cloned component defaults and migrates root-motion policy", () => {
    const first = decodeAnimatorComponent(undefined);
    first.rootMotion.translationAxes.x = false;
    expect(decodeAnimatorComponent(undefined)).toEqual(DEFAULT_ANIMATOR_COMPONENT);

    const decoded = decodeAnimatorComponent({
      controller_ref: { guid: CONTROLLER_GUID, local_id: "main" },
      avatar_ref: { guid: AVATAR_GUID, local_id: "avatar:Human" },
      root_motion: {
        mode: "applyToObject",
        source: "hips",
        translation_axes: { x: true, y: false, z: true },
        rotation: "full",
        bake_into_pose: true,
      },
      update_mode: "fixedStep",
      culling_mode: "alwaysAnimate",
      parameter_overrides: [
        { parameter_id: "speed", value: 1 },
        { parameter_id: "speed", value: 2 },
        { parameter_id: "bad", value: Number.NaN },
      ],
      futureAnimatorPolicy: { retained: true },
    });
    expect(decoded).toMatchObject({
      controllerRef: { guid: CONTROLLER_GUID, localId: "main" },
      avatarRef: { guid: AVATAR_GUID, localId: "avatar:Human" },
      rootMotion: {
        mode: "applyToObject",
        source: "hips",
        translationAxes: { x: true, y: false, z: true },
        rotation: "full",
        bakeIntoPose: true,
      },
      updateMode: "fixedStep",
      cullingMode: "alwaysAnimate",
      parameterOverrides: [{ parameterId: "speed", value: 2 }],
      extensions: { futureAnimatorPolicy: { retained: true } },
    });
    expect(decodeAnimatorComponent(encodeAnimatorComponent(decoded))).toEqual(decoded);
  });

  it("creates independent component defaults and a valid empty controller", () => {
    const first = createDefaultAnimatorComponent();
    const second = createDefaultAnimatorComponent();
    first.rootMotion.translationAxes.x = false;
    expect(second.rootMotion.translationAxes.x).toBe(true);
    first.controller!.layers[0]!.name = "Changed";
    expect(second.controller?.layers[0]?.name).toBe("Base Layer");
    expect(decodeAnimatorComponent(encodeAnimatorComponent(second))).toEqual(second);

    const controller = createAnimatorController("controller:new", "New Controller");
    expect(controller.layers).toEqual([expect.objectContaining({
      id: "base-layer",
      name: "Base Layer",
      weight: 1,
    })]);
    expect(decodeAnimatorController(encodeAnimatorController(controller))).toEqual(controller);
  });

  it("migrates legacy signals and groups to graph layout without deleting Float parameters", () => {
    const document = controllerDocument();
    Object.assign(document, {
      behaviorMap: {
        signals: [{
          id: "move",
          name: "Movement",
          kind: "vector2",
          purpose: "movement",
          xParameterId: "speed",
          yParameterId: "strafe",
          minimum: [-1, -1],
          maximum: [1, 1],
          smoothingSeconds: 0.08,
        }],
        layers: [{
          layerId: "base",
          nodes: [{ id: "state:locomotion", position: [-420_000, 180_000] }],
          groups: [{ id: "grounded", name: "Grounded", kind: "behavior", stateIds: ["locomotion"] }],
        }],
      },
    });
    document.parameters.push({ id: "strafe", name: "Strafe", kind: "float", default_value: 0 });
    const decoded = decodeAnimatorController(document);

    expect(decoded.behaviorMap).toMatchObject({
      layers: [{ nodes: [{ position: [-420_000, 180_000] }] }],
    });
    expect(decoded.parameters.map((parameter) => parameter.id)).toContain("strafe");
    expect(decoded.layers[0]?.states[0]?.motion).toMatchObject({
      tree: { parameterId: "speed" },
    });
    const encoded = encodeAnimatorController(decoded);
    expect(encoded.behaviorMap).not.toHaveProperty("signals");
    expect(encoded.behaviorMap?.layers[0]).not.toHaveProperty("groups");
    expect(decodeAnimatorController(encodeAnimatorController(decoded))).toEqual(decoded);
  });

  it("ignores malformed legacy signal and group wrappers", () => {
    const document = controllerDocument();
    Object.assign(document, { behaviorMap: {
      signals: [
        { id: "move", kind: "vector2", xParameterId: "missing", yParameterId: "missing" },
      ],
      layers: [{
        layerId: "base",
        nodes: [],
        groups: [
          { id: "grounded", stateIds: ["locomotion"] },
          { id: "movement", stateIds: ["locomotion"] },
        ],
      }],
    } });
    expect(() => decodeAnimatorController(document)).not.toThrow();
  });

  it("rejects future Animator documents", () => {
    expect(() => decodeAnimatorController({ version: "braze/animator-controller-v2" }))
      .toThrowError(CharacterCodecError);
    expect(() => decodeAnimatorComponent({ version: "braze/animator-component-v3" }))
      .toThrowError(CharacterCodecError);
  });

  it("accepts controller collection boundaries and rejects max plus one", () => {
    const parameters = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.parametersPerController },
      (_, index) => ({ id: `p${index}`, name: `P${index}`, kind: "float", defaultValue: 0 }),
    );
    const parameterBoundary = decodeAnimatorController({
      id: "parameter-boundary",
      name: "Parameter Boundary",
      parameters,
      layers: [],
    });
    expect(parameterBoundary.parameters).toHaveLength(ANIMATOR_DOCUMENT_LIMITS.parametersPerController);
    expect(() => encodeAnimatorController(parameterBoundary)).not.toThrow();
    parameterBoundary.parameters.push({ id: "encode-overflow", name: "Overflow", kind: "float", defaultValue: 0 });
    expectLimitFailure(() => encodeAnimatorController(parameterBoundary), "parameters");
    expectLimitFailure(
      () => decodeAnimatorController({
        id: "parameter-over",
        name: "Parameter Over",
        parameters: [...parameters, { id: "overflow", name: "Overflow", kind: "float" }],
        layers: [],
      }),
      "parameters",
    );

    const layers = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.layersPerController },
      (_, index) => emptyLayer(`layer-${index}`),
    );
    expect(decodeAnimatorController({ id: "layer-boundary", name: "Layer Boundary", layers }).layers)
      .toHaveLength(ANIMATOR_DOCUMENT_LIMITS.layersPerController);
    expectLimitFailure(
      () => decodeAnimatorController({
        id: "layer-over",
        name: "Layer Over",
        layers: [...layers, emptyLayer("overflow")],
      }),
      "layers",
    );

    const states = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.statesPerLayer },
      (_, index) => emptyState(`state-${index}`),
    );
    expect(decodeAnimatorController({
      id: "state-boundary",
      name: "State Boundary",
      layers: [{ ...emptyLayer("base"), defaultStateId: "state-0", states }],
    }).layers[0]?.states).toHaveLength(ANIMATOR_DOCUMENT_LIMITS.statesPerLayer);
    expectLimitFailure(
      () => decodeAnimatorController({
        id: "state-over",
        name: "State Over",
        layers: [{ ...emptyLayer("base"), states: [...states, emptyState("overflow")] }],
      }),
      "layers[0].states",
    );
  });

  it("bounds authored and Any State-expanded transition work before decoding", () => {
    const transitions = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer },
      (_, index) => stateTransition(`transition-${index}`, "state"),
    );
    expect(decodeAnimatorController({
      id: "transition-boundary",
      name: "Transition Boundary",
      layers: [{
        ...emptyLayer("base"),
        defaultStateId: "state",
        states: [{ ...emptyState("state"), transitions }],
      }],
    }).layers[0]?.states[0]?.transitions).toHaveLength(ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer);
    expectLimitFailure(
      () => decodeAnimatorController({
        id: "transition-over",
        name: "Transition Over",
        layers: [{
          ...emptyLayer("base"),
          defaultStateId: "state",
          states: [{
            ...emptyState("state"),
            transitions: [...transitions, stateTransition("overflow", "state")],
          }],
        }],
      }),
      "layers[0].states[0].transitions",
    );

    const states = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.statesPerLayer },
      (_, index) => emptyState(`state-${index}`),
    );
    const anyStateTransitions = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.transitionsPerLayer / states.length },
      (_, index) => stateTransition(`any-${index}`, "state-0"),
    );
    expect(() => decodeAnimatorController({
      id: "expanded-boundary",
      name: "Expanded Boundary",
      layers: [{ ...emptyLayer("base"), defaultStateId: "state-0", states, anyStateTransitions }],
    })).not.toThrow();
    expectLimitFailure(
      () => decodeAnimatorController({
        id: "expanded-over",
        name: "Expanded Over",
        layers: [{
          ...emptyLayer("base"),
          defaultStateId: "state-0",
          states,
          anyStateTransitions: [...anyStateTransitions, stateTransition("any-overflow", "state-0")],
        }],
      }),
      "layers[0].transitions",
    );
  });

  it("bounds transition conditions, state events, and component overrides", () => {
    const conditions = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.conditionsPerTransition },
      () => ({ parameterId: "speed", mode: "greater", threshold: 0 }),
    );
    const events = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.stateEventsPerState },
      (_, index) => ({ id: `event-${index}`, name: `Event ${index}`, timeNormalized: 0.5 }),
    );
    const bounded = {
      id: "nested-boundary",
      name: "Nested Boundary",
      parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }],
      layers: [{
        ...emptyLayer("base"),
        defaultStateId: "state",
        states: [{
          ...emptyState("state"),
          events,
          transitions: [{ ...stateTransition("transition", "state"), conditions }],
        }],
      }],
    };
    expect(() => decodeAnimatorController(bounded)).not.toThrow();
    expectLimitFailure(
      () => decodeAnimatorController({
        ...bounded,
        layers: [{
          ...bounded.layers[0],
          states: [{
            ...bounded.layers[0]!.states[0],
            transitions: [{
              ...bounded.layers[0]!.states[0]!.transitions[0],
              conditions: [...conditions, { parameterId: "speed", mode: "greater" }],
            }],
          }],
        }],
      }),
      "layers[0].states[0].transitions[0].conditions",
    );
    expectLimitFailure(
      () => decodeAnimatorController({
        ...bounded,
        layers: [{
          ...bounded.layers[0],
          states: [{
            ...bounded.layers[0]!.states[0],
            events: [...events, { id: "event-overflow", name: "Overflow" }],
          }],
        }],
      }),
      "layers[0].states[0].events",
    );

    const overrides = Array.from(
      { length: ANIMATOR_DOCUMENT_LIMITS.parameterOverridesPerComponent },
      (_, index) => ({ parameterId: `parameter-${index}`, value: index }),
    );
    expect(decodeAnimatorComponent({ parameterOverrides: overrides }).parameterOverrides)
      .toHaveLength(ANIMATOR_DOCUMENT_LIMITS.parameterOverridesPerComponent);
    expectLimitFailure(
      () => decodeAnimatorComponent({
        parameterOverrides: [...overrides, { parameterId: "overflow", value: true }],
      }),
      "parameterOverrides",
    );
    const component = { ...createDefaultAnimatorComponent(), parameterOverrides: overrides };
    expect(() => encodeAnimatorComponent(component)).not.toThrow();
    component.parameterOverrides.push({ parameterId: "overflow", value: 999 });
    expectLimitFailure(() => encodeAnimatorComponent(component), "parameterOverrides");
  });
});

function emptyLayer(id: string) {
  return {
    id,
    name: id,
    defaultStateId: "",
    states: [] as ReturnType<typeof emptyState>[],
    anyStateTransitions: [] as ReturnType<typeof stateTransition>[],
  };
}

function emptyState(id: string) {
  return { id, name: id, transitions: [], events: [] };
}

function stateTransition(id: string, destinationStateId: string) {
  return {
    id,
    destination: { kind: "state", stateId: destinationStateId },
    conditions: [] as Array<{ parameterId: string; mode: string; threshold?: number }>,
  };
}

function expectLimitFailure(run: () => unknown, path: string): void {
  try {
    run();
    throw new Error("Expected CharacterCodecError");
  } catch (error) {
    expect(error).toBeInstanceOf(CharacterCodecError);
    expect(error).toMatchObject({ code: "invalid-document", path });
  }
}
