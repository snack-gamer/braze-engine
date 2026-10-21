import { describe, expect, it } from "vitest";
import type { AnimatorController, AnimatorState, AnimatorTransition } from "../domain/animator-controller";
import { compileAnimatorController } from "./animator-controller-compiler";
import {
  MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION,
  MAX_RUNTIME_ANIMATOR_LAYERS,
  MAX_RUNTIME_ANIMATOR_PARAMETERS,
  MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER,
  MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER,
} from "./animator-runtime-limits";
import { validateRuntimeAnimatorController } from "./animator-runtime-validation";
import type { RuntimeAnimatorControllerDefinition } from "./animator-runtime";

const GUID = "a".repeat(32);

describe("Animator graph budgets", () => {
  it("rejects oversized authored dimensions before graph expansion", () => {
    const cases: Array<[string, (value: AnimatorController) => void]> = [
      ["animator-parameter-budget-exceeded", (value) => {
        value.parameters = Array.from({ length: MAX_RUNTIME_ANIMATOR_PARAMETERS + 1 }, (_, index) => ({
          id: `p${index}`, name: `P${index}`, kind: "float", defaultValue: 0,
        }));
      }],
      ["animator-layer-budget-exceeded", (value) => {
        value.layers = Array.from({ length: MAX_RUNTIME_ANIMATOR_LAYERS + 1 }, (_, index) => ({
          ...value.layers[0]!, id: `layer${index}`, name: `Layer ${index}`,
        }));
      }],
      ["animator-state-budget-exceeded", (value) => {
        value.layers[0]!.states = Array.from(
          { length: MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER + 1 },
          (_, index) => state(`s${index}`),
        );
      }],
      ["animator-transition-budget-exceeded", (value) => {
        value.layers[0]!.anyStateTransitions = Array.from({ length: 9 }, (_, index) => transition(`t${index}`));
        value.layers[0]!.states = Array.from(
          { length: MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER },
          (_, index) => state(`s${index}`),
        );
      }],
      ["animator-condition-budget-exceeded", (value) => {
        value.layers[0]!.states[0]!.transitions = [{
          ...transition("conditions"),
          conditions: Array.from(
            { length: MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION + 1 },
            () => ({ parameterId: "speed", mode: "greater", threshold: 0 }),
          ),
        }];
      }],
    ];

    for (const [code, mutate] of cases) {
      const source = controller();
      mutate(source);
      expect(compileAnimatorController(source, () => 1).diagnostics.map((item) => item.code))
        .toContain(code);
    }
  });

  it("rejects latent Any State records even when a layer has no states", () => {
    const source = controller();
    source.layers[0]!.states = [];
    source.layers[0]!.anyStateTransitions = Array.from(
      { length: MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER + 1 },
      (_, index) => transition(`latent-${index}`),
    );

    expect(compileAnimatorController(source, () => 1).diagnostics.map((item) => item.code))
      .toContain("animator-transition-budget-exceeded");
  });

  it("bounds direct runtime definitions that bypass the authored compiler", () => {
    const states = Array.from(
      { length: MAX_RUNTIME_ANIMATOR_STATES_PER_LAYER + 1 },
      (_, index) => runtimeState(`s${index}`),
    );
    const transitions = Array.from(
      { length: MAX_RUNTIME_ANIMATOR_TRANSITIONS_PER_LAYER + 1 },
      (_, index) => ({
        id: `t${index}`,
        sourceStateId: "s0",
        destinationStateId: "s0",
        durationSeconds: 0,
        conditions: index === 0
          ? Array.from({ length: MAX_RUNTIME_ANIMATOR_CONDITIONS_PER_TRANSITION + 1 }, () => ({
              parameter: "p0", operator: "greater" as const, value: 0,
            }))
          : [],
      }),
    );
    const layer = {
      id: "base",
      initialStateId: "s0",
      weight: 1,
      blendMode: "override" as const,
      states,
      transitions,
    };
    const runtime: RuntimeAnimatorControllerDefinition = {
      id: "controller",
      revision: "r1",
      parameters: Array.from({ length: MAX_RUNTIME_ANIMATOR_PARAMETERS + 1 }, (_, index) => ({
        name: `p${index}`, type: "float" as const, defaultValue: 0,
      })),
      layers: Array.from({ length: MAX_RUNTIME_ANIMATOR_LAYERS + 1 }, (_, index) => ({
        ...layer,
        id: index === 0 ? "base" : `layer${index}`,
      })),
    };

    const codes = validateRuntimeAnimatorController(runtime).map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining([
      "animator-parameter-budget-exceeded",
      "animator-layer-budget-exceeded",
      "animator-state-budget-exceeded",
      "animator-transition-budget-exceeded",
      "animator-condition-budget-exceeded",
    ]));
  });
});

function controller(): AnimatorController {
  return {
    version: 1,
    id: "controller",
    name: "Controller",
    revision: "r1",
    parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }],
    layers: [{
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "s0",
      states: [state("s0")],
      anyStateTransitions: [],
    }],
  };
}

function state(id: string): AnimatorState {
  return {
    id,
    name: id,
    motion: { kind: "clip", clipRef: { guid: GUID, localId: "clip" }, speed: 1 },
    speed: 1,
    cycleOffset: 0,
    mirror: false,
    footIk: false,
    writeDefaults: true,
    transitions: [],
    events: [],
  };
}

function transition(id: string): AnimatorTransition {
  return {
    id,
    destination: { kind: "state", stateId: "s0" },
    conditions: [],
    hasExitTime: false,
    exitTimeNormalized: 0,
    durationMode: "seconds",
    duration: 0,
    offsetNormalized: 0,
    interruptionSource: "none",
    orderedInterruption: true,
    canTransitionToSelf: true,
  };
}

function runtimeState(id: string) {
  return {
    id,
    motion: null,
    durationSeconds: 1,
    speed: 1,
    loop: false,
    events: [],
  };
}
