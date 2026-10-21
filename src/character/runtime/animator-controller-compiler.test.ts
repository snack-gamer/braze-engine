import { describe, expect, it } from "vitest";
import type { AnimatorController, AnimatorState } from "../domain/animator-controller";
import type { AnimatorMotion, BlendTree1D, BlendTreeDirect } from "../domain/blend-tree";
import {
  advanceAnimatorRuntime,
  createAnimatorRuntimeState,
  withAnimatorParameter,
} from "./animator-runtime";
import { compileAnimatorController } from "./animator-controller-compiler";
import { buildLayerBlendPlan } from "./layer-blend-plan";

const CLIP_REF = { guid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", localId: "idle" } as const;

function state(overrides: Partial<AnimatorState> = {}): AnimatorState {
  return {
    id: "idle",
    name: "Idle",
    motion: { kind: "clip", clipRef: CLIP_REF, speed: 2 },
    speed: 1,
    cycleOffset: 0,
    mirror: false,
    footIk: false,
    writeDefaults: true,
    transitions: [],
    events: [],
    ...overrides,
  };
}

function controller(states: AnimatorState[] = [state()]): AnimatorController {
  return {
    version: 1,
    id: "controller",
    name: "Controller",
    revision: "revision-1",
    parameters: [],
    layers: [{
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: states[0]!.id,
      states,
      anyStateTransitions: [],
    }],
  };
}

function budgetTransition(
  id: string,
  destination: AnimatorState["transitions"][number]["destination"],
  conditionCount = 0,
): AnimatorState["transitions"][number] {
  return {
    id,
    destination,
    conditions: Array.from({ length: conditionCount }, () => ({
      parameterId: "flag",
      mode: "if" as const,
    })),
    hasExitTime: false,
    exitTimeNormalized: 0,
    durationMode: "seconds",
    duration: 0,
    offsetNormalized: 0,
    interruptionSource: "none",
    orderedInterruption: true,
    canTransitionToSelf: false,
  };
}

describe("Animator controller compiler", () => {
  it("reports one precise Entry issue for an empty authored layer", () => {
    const source = controller();
    source.layers[0] = {
      ...source.layers[0]!,
      defaultStateId: "",
      states: [],
    };

    expect(compileAnimatorController(source, () => 1).diagnostics.map((item) => item.code))
      .toEqual(["invalid-state-machine-entry"]);
  });

  it("flattens nested Entry, scoped Any State, and parameter-gated Exit routes", () => {
    const transition = (
      id: string,
      destination: AnimatorState["transitions"][number]["destination"],
      conditions: AnimatorState["transitions"][number]["conditions"] = [],
    ): AnimatorState["transitions"][number] => ({
      id,
      destination,
      conditions,
      hasExitTime: false,
      exitTimeNormalized: 0,
      durationMode: "seconds",
      duration: 0,
      offsetNormalized: 0,
      interruptionSource: "none",
      orderedInterruption: true,
      canTransitionToSelf: false,
    });
    const source = controller([
      state({
        id: "idle",
        transitions: [transition("enter-action", { kind: "stateMachine", stateMachineId: "action" })],
      }),
      state({ id: "done" }),
    ]);
    source.parameters.push({ id: "finished", name: "Finished", kind: "boolean", defaultValue: false });
    source.parameters.push({ id: "recover", name: "Recover", kind: "boolean", defaultValue: false });
    source.layers[0]!.stateMachines = [{
      id: "action",
      name: "Action",
      defaultStateId: "phase",
      states: [],
      stateMachines: [{
        id: "phase",
        name: "Phase",
        defaultStateId: "windup",
        states: [
          state({ id: "windup", transitions: [transition("leave-phase", { kind: "exit" })] }),
          state({ id: "recover" }),
        ],
        stateMachines: [],
        anyStateTransitions: [transition("local-recover", { kind: "state", stateId: "recover" }, [{
          parameterId: "recover",
          mode: "if",
        }])],
        transitions: [transition("leave-action", { kind: "exit" })],
      }],
      anyStateTransitions: [],
      transitions: [transition("finish-action", { kind: "state", stateId: "done" }, [{
        parameterId: "finished",
        mode: "if",
      }])],
    }];

    const compiled = compileAnimatorController(source, () => 1);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.value?.layers[0]?.states.map((item) => item.id)).toEqual([
      "idle", "done", "windup", "recover",
    ]);
    expect(compiled.value?.layers[0]?.transitions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "local-recover@windup",
      "local-recover@recover",
      "enter-action",
    ]));
    expect(compiled.value?.layers[0]?.transitions.some((item) => item.id.includes("@idle")
      && item.id.startsWith("local-recover"))).toBe(false);

    const runtime = createAnimatorRuntimeState(compiled.value!).value!;
    const entered = advanceAnimatorRuntime(compiled.value!, runtime, 0).value!.state;
    expect(entered.layers[0]?.currentStateId).toBe("windup");
    const waiting = advanceAnimatorRuntime(compiled.value!, entered, 0).value!.state;
    expect(waiting.layers[0]?.currentStateId).toBe("windup");
    const finished = withAnimatorParameter(compiled.value!, waiting, "finished", true).value!;
    const exited = advanceAnimatorRuntime(compiled.value!, finished, 0).value!.state;
    expect(exited.layers[0]?.currentStateId).toBe("done");
  });

  it("bounds cyclic authored state-machine trees", () => {
    const cyclic = controller();
    const machine = {
      id: "cycle",
      name: "Cycle",
      defaultStateId: "",
      states: [],
      stateMachines: [] as NonNullable<AnimatorController["layers"][number]["stateMachines"]>,
      anyStateTransitions: [],
      transitions: [],
    };
    machine.stateMachines.push(machine);
    cyclic.layers[0]!.stateMachines = [machine];
    expect(compileAnimatorController(cyclic, () => 1).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "cyclic-animator-state-machine", severity: "error" }),
    ]));
  });

  it("bounds over-depth authored state-machine trees", () => {
    const source = controller();
    let child = {
      id: "machine-9",
      name: "Machine 9",
      defaultStateId: "deep-state",
      states: [state({ id: "deep-state" })],
      stateMachines: [] as NonNullable<AnimatorController["layers"][number]["stateMachines"]>,
      anyStateTransitions: [],
      transitions: [],
    };
    for (let depth = 8; depth >= 1; depth -= 1) {
      child = {
        id: `machine-${depth}`,
        name: `Machine ${depth}`,
        defaultStateId: child.id,
        states: [],
        stateMachines: [child],
        anyStateTransitions: [],
        transitions: [],
      };
    }
    source.layers[0]!.stateMachines = [child];

    expect(compileAnimatorController(source, () => 1).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "animator-state-machine-depth-exceeded", severity: "error" }),
    ]));
  });

  it("rejects exponential nested Exit-route expansion before runtime validation", () => {
    const source = controller([state({ id: "idle" })]);
    const routes = (scope: string, destination: "exit" | "idle") => Array.from(
      { length: 8 },
      (_, index) => budgetTransition(
        `${scope}-route-${index}`,
        destination === "exit" ? { kind: "exit" } : { kind: "state", stateId: "idle" },
      ),
    );
    source.layers[0]!.stateMachines = [{
      id: "machine-1", name: "Machine 1", defaultStateId: "machine-2", states: [],
      anyStateTransitions: [], transitions: routes("machine-1", "idle"), stateMachines: [{
        id: "machine-2", name: "Machine 2", defaultStateId: "machine-3", states: [],
        anyStateTransitions: [], transitions: routes("machine-2", "exit"), stateMachines: [{
          id: "machine-3", name: "Machine 3", defaultStateId: "machine-4", states: [],
          anyStateTransitions: [], transitions: routes("machine-3", "exit"), stateMachines: [{
            id: "machine-4", name: "Machine 4", defaultStateId: "leaf",
            states: [state({
              id: "leaf",
              transitions: [budgetTransition("leaf-exit", { kind: "exit" })],
            })],
            stateMachines: [], anyStateTransitions: [], transitions: routes("machine-4", "exit"),
          }],
        }],
      }],
    }];

    const compiled = compileAnimatorController(source, () => 1);
    expect(compiled.value).toBeNull();
    expect(compiled.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "animator-transition-budget-exceeded", severity: "error" }),
    ]));
  });

  it("does not emit nested Exit variants exceeding the combined condition budget", () => {
    const source = controller([state({ id: "idle" })]);
    source.parameters.push({ id: "flag", name: "Flag", kind: "boolean", defaultValue: false });
    source.layers[0]!.stateMachines = [{
      id: "action",
      name: "Action",
      defaultStateId: "leaf",
      states: [state({
        id: "leaf",
        transitions: [budgetTransition("leaf-exit", { kind: "exit" }, 8)],
      })],
      stateMachines: [],
      anyStateTransitions: [],
      transitions: [budgetTransition("action-route", { kind: "state", stateId: "idle" }, 9)],
    }];

    const compiled = compileAnimatorController(source, () => 1);
    expect(compiled.value).toBeNull();
    expect(compiled.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "animator-condition-budget-exceeded", severity: "error" }),
    ]));
  });

  it("preserves deterministic authored transition order", () => {
    const source = controller([
      state({ id: "idle", name: "Idle", transitions: [
        {
          id: "low", destination: { kind: "state", stateId: "walk" }, conditions: [],
          hasExitTime: false, exitTimeNormalized: 0, durationMode: "seconds", duration: 0,
          offsetNormalized: 0, interruptionSource: "none", orderedInterruption: true,
          canTransitionToSelf: false,
        },
        {
          id: "high", destination: { kind: "state", stateId: "run" }, conditions: [],
          hasExitTime: false, exitTimeNormalized: 0, durationMode: "seconds", duration: 0,
          offsetNormalized: 0, interruptionSource: "none", orderedInterruption: true,
          canTransitionToSelf: false,
        },
      ] }),
      state({ id: "walk", name: "Walk" }),
      state({ id: "run", name: "Run" }),
    ]);
    const compiled = compileAnimatorController(source, () => 1).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const advanced = advanceAnimatorRuntime(compiled, initial, 0).value!;
    expect(advanced.firedTransitionIds).toEqual(["low"]);
    expect(advanced.state.layers[0]?.currentStateId).toBe("walk");
  });
  it("preserves clip timing and looping metadata in the sample plan", () => {
    const compiled = compileAnimatorController(controller(), () => ({
      durationSeconds: 1,
      looping: false,
    }));
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.value?.layers[0]?.states[0]?.loop).toBe(false);
    expect(compiled.value?.layers[0]?.states[0]?.durationSeconds).toBe(0.5);

    const initial = createAnimatorRuntimeState(compiled.value!).value!;
    const advanced = advanceAnimatorRuntime(compiled.value!, initial, 0.25).value!.state;
    const sample = buildLayerBlendPlan(compiled.value!, advanced).value?.instructions[0]?.clips[0];
    expect(sample?.localTimeSeconds).toBe(0.5);
    expect(sample).toMatchObject({ durationSeconds: 1, looping: false });
  });

  it("lets a Clip loop option override its imported source setting", () => {
    const source = controller([state({
      motion: { kind: "clip", clipRef: CLIP_REF, speed: 1, loopMode: "loop" },
    })]);
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 1, looping: false }));
    expect(compiled.value?.layers[0]?.states[0]?.loop).toBe(true);
    expect(compiled.value?.layers[0]?.states[0]?.motion).toMatchObject({ looping: true });
  });

  it("applies a nested Blend Tree Clip loop override", () => {
    const source = controller([state({ motion: {
      kind: "blendTree",
      tree: { kind: "1d", parameterId: "speed", children: [{
        id: "idle", threshold: 0, timeScale: 1, mirror: false,
        motion: { kind: "clip", clipRef: CLIP_REF, speed: 1, loopMode: "once" },
      }] },
    } })]);
    source.parameters.push({ id: "speed", name: "Speed", kind: "float", defaultValue: 0 });
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 1, looping: true }));
    expect(compiled.value?.layers[0]?.states[0]?.loop).toBe(false);
    expect(compiled.value?.layers[0]?.states[0]?.motion).toMatchObject({
      children: [{ motion: { looping: false } }],
    });
  });

  it("evaluates the base layer as a full-weight override", () => {
    const source = controller();
    source.layers[0]!.weight = 0;
    source.layers[0]!.blendingMode = "additive";
    const compiled = compileAnimatorController(source, () => 1).value!;
    const runtime = createAnimatorRuntimeState(compiled).value!;
    const base = buildLayerBlendPlan(compiled, runtime).value?.instructions[0];

    expect(base?.layerWeight).toBe(1);
    expect(base?.blendMode).toBe("override");
  });

  it("supports foot IK while still rejecting invalid typed conditions", () => {
    const invalidState = state({
      footIk: true,
      events: [{ id: "event", name: "Event", timeNormalized: 0.5, payload: {} }],
      transitions: [{
        id: "bad-condition",
        destination: { kind: "state", stateId: "idle" },
        conditions: [{ parameterId: "grounded", mode: "greater", threshold: 0 }],
        hasExitTime: false,
        exitTimeNormalized: 0,
        durationMode: "seconds",
        duration: 0,
        offsetNormalized: 0,
        interruptionSource: "none",
        orderedInterruption: true,
        canTransitionToSelf: true,
      }],
    });
    const source = controller([invalidState]);
    source.parameters.push({ id: "grounded", name: "Grounded", kind: "boolean", defaultValue: true });
    const compiled = compileAnimatorController(source, () => 1);

    expect(compiled.value).toBeNull();
    expect(compiled.diagnostics.map((item) => item.code)).toContain("invalid-condition-value");
    expect(compiled.diagnostics.map((item) => item.code)).not.toContain("unsupported-state-foot-ik");
  });

  it("compiles and recursively evaluates nested 1D and 2D blend trees", () => {
    const clip = (localId: string): AnimatorMotion => ({
      kind: "clip",
      clipRef: { ...CLIP_REF, localId },
      speed: 1,
    });
    const nested: AnimatorMotion = {
      kind: "blendTree",
      tree: {
        kind: "1d",
        parameterId: "speed",
        children: [
          { id: "stopped", threshold: 0, motion: clip("idle"), timeScale: 1, mirror: false },
          {
            id: "moving",
            threshold: 1,
            timeScale: 2,
            mirror: false,
            motion: {
              kind: "blendTree",
              tree: {
                kind: "2dSimpleDirectional",
                parameterXId: "moveX",
                parameterYId: "moveY",
                children: [
                  { id: "center", position: [0, 0], motion: clip("idle"), timeScale: 1, mirror: false },
                  { id: "right", position: [1, 0], motion: clip("right"), timeScale: 1, mirror: false },
                  { id: "up", position: [0, 1], motion: clip("up"), timeScale: 1, mirror: false },
                ],
              },
            },
          },
        ],
      },
    };
    const source = controller([state({ motion: nested })]);
    source.parameters.push(
      { id: "speed", name: "Speed", kind: "float", defaultValue: 1 },
      { id: "moveX", name: "Move X", kind: "float", defaultValue: 0.5 },
      { id: "moveY", name: "Move Y", kind: "float", defaultValue: 0 },
    );
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 1, looping: true }));
    const runtime = createAnimatorRuntimeState(compiled.value!).value!;
    const advanced = advanceAnimatorRuntime(compiled.value!, runtime, 0.25).value!.state;
    const samples = buildLayerBlendPlan(compiled.value!, advanced).value?.instructions[0]?.clips;

    expect(compiled.diagnostics).toEqual([]);
    expect(samples?.map(({
      sampleId: _sampleId, unwrappedLocalTimeSeconds: _unwrapped, ...sample
    }) => sample)).toEqual([
      { clipId: `${CLIP_REF.guid}:idle`, localTimeSeconds: 0.5, durationSeconds: 1, looping: true, weight: 0.5 },
      { clipId: `${CLIP_REF.guid}:right`, localTimeSeconds: 0.5, durationSeconds: 1, looping: true, weight: 0.5 },
    ]);
    expect(samples?.map((sample) => sample.unwrappedLocalTimeSeconds)).toEqual([0.5, 0.5]);
    expect(new Set(samples?.map((sample) => sample.sampleId)).size).toBe(2);
  });

  it("keeps unequal-duration Blend Tree clips on the same normalized phase", () => {
    const shortRef = { ...CLIP_REF, localId: "short" };
    const longRef = { ...CLIP_REF, localId: "long" };
    const source = controller([state({ motion: {
      kind: "blendTree",
      tree: {
        kind: "1d",
        parameterId: "speed",
        children: [
          {
            id: "short",
            threshold: 0,
            motion: { kind: "clip", clipRef: shortRef, speed: 1, loopMode: "loop" },
            timeScale: 1,
            mirror: false,
          },
          {
            id: "long",
            threshold: 1,
            motion: { kind: "clip", clipRef: longRef, speed: 1, loopMode: "loop" },
            timeScale: 1,
            mirror: false,
          },
        ],
      },
    } })]);
    source.parameters.push({ id: "speed", name: "Speed", kind: "float", defaultValue: 0.5 });
    const durations = new Map([
      [`${shortRef.guid}:${shortRef.localId}`, 1.7],
      [`${longRef.guid}:${longRef.localId}`, 11 / 3],
    ]);
    const compiled = compileAnimatorController(
      source,
      (reference) => ({
        durationSeconds: durations.get(`${reference.guid}:${reference.localId}`)!,
        looping: true,
      }),
    ).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const advanced = advanceAnimatorRuntime(compiled, initial, 1).value!.state;
    const samples = buildLayerBlendPlan(compiled, advanced).value!.instructions[0]!.clips;
    const phases = samples.map((sample) => sample.localTimeSeconds / sample.durationSeconds!);
    const midpointFrequency = 0.5 / 1.7 + 0.5 / (11 / 3);

    expect(samples.map((sample) => sample.weight)).toEqual([0.5, 0.5]);
    expect(phases[0]).toBeCloseTo(phases[1]!, 8);
    expect(phases[0]).toBeCloseTo(midpointFrequency, 8);

    const endpoint = withAnimatorParameter(compiled, advanced, "speed", 1).value!;
    expect(endpoint.layers[0]?.stateTimeSeconds).toBe(advanced.layers[0]?.stateTimeSeconds);
    const endpointPhases = buildLayerBlendPlan(compiled, endpoint).value!.instructions[0]!.clips
      .map((sample) => sample.localTimeSeconds / sample.durationSeconds!);
    expect(endpointPhases).toHaveLength(1);
    expect(endpointPhases[0]).toBeCloseTo(midpointFrequency, 8);

    const continued = advanceAnimatorRuntime(compiled, endpoint, 1).value!.state;
    const continuedPhase = buildLayerBlendPlan(compiled, continued).value!.instructions[0]!.clips[0]!;
    expect(continuedPhase.localTimeSeconds / continuedPhase.durationSeconds!)
      .toBeCloseTo(midpointFrequency + 1 / (11 / 3), 8);
  });

  it("keeps an all-zero Direct tree timeline advancing without emitting clips", () => {
    const source = controller([state({ motion: {
      kind: "blendTree",
      tree: {
        kind: "direct",
        normalizeWeights: true,
        children: [{
          id: "only",
          weightParameterId: "weight",
          motion: { kind: "clip", clipRef: CLIP_REF, speed: 1, loopMode: "loop" },
          timeScale: 1,
          mirror: false,
        }],
      },
    } })]);
    source.parameters.push({ id: "weight", name: "Weight", kind: "float", defaultValue: 0 });
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 2, looping: true })).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const advanced = advanceAnimatorRuntime(compiled, initial, 1);

    expect(advanced.value?.state.layers[0]?.stateTimeSeconds).toBe(1);
    expect(buildLayerBlendPlan(compiled, advanced.value!.state).value?.instructions[0]?.clips).toEqual([]);
    expect(advanced.diagnostics.map((item) => item.code)).toContain("zero-direct-blend-weight-sum");
  });

  it("rejects a motion frequency that cannot stay finite", () => {
    const compiled = compileAnimatorController(
      controller([state({ motion: {
        kind: "clip",
        clipRef: CLIP_REF,
        speed: 1,
        loopMode: "loop",
      } })]),
      () => ({ durationSeconds: Number.MIN_VALUE, looping: true }),
    ).value!;
    const advanced = advanceAnimatorRuntime(compiled, createAnimatorRuntimeState(compiled).value!, 1);

    expect(advanced.value).toBeNull();
    expect(advanced.diagnostics.map((item) => item.code)).toContain("invalid-motion-frequency");
  });

  it("diagnoses cyclic and over-depth nested trees without recursing forever", () => {
    const cyclicTree: BlendTree1D = { kind: "1d", parameterId: "speed", children: [] };
    const cyclic: AnimatorMotion = { kind: "blendTree", tree: cyclicTree };
    cyclicTree.children.push({
      id: "cycle",
      motion: cyclic,
      timeScale: 1,
      mirror: false,
      threshold: 0,
    });
    const cyclicController = controller([state({ motion: cyclic })]);
    cyclicController.parameters.push({ id: "speed", name: "Speed", kind: "float", defaultValue: 0 });
    const cycleResult = compileAnimatorController(cyclicController, () => 1);
    expect(cycleResult.value).toBeNull();
    expect(cycleResult.diagnostics.map((item) => item.code)).toContain("cyclic-blend-tree");

    const directTree: BlendTreeDirect = { kind: "direct", normalizeWeights: true, children: [] };
    const cyclicDirect: AnimatorMotion = { kind: "blendTree", tree: directTree };
    directTree.children.push({
      id: "direct-cycle",
      motion: cyclicDirect,
      timeScale: 1,
      mirror: false,
      weightParameterId: "weight",
    });
    const directController = controller([state({ motion: cyclicDirect })]);
    directController.parameters.push({ id: "weight", name: "Weight", kind: "float", defaultValue: 1 });
    expect(compileAnimatorController(directController, () => 1).diagnostics.map((item) => item.code))
      .toContain("cyclic-blend-tree");

    let deepMotion: AnimatorMotion = { kind: "clip", clipRef: CLIP_REF, speed: 1 };
    for (let depth = 0; depth < 10; depth += 1) deepMotion = {
      kind: "blendTree",
      tree: {
        kind: "1d",
        parameterId: "speed",
        children: [{ id: `depth-${depth}`, motion: deepMotion, timeScale: 1, mirror: false, threshold: 0 }],
      },
    };
    const deepController = controller([state({ motion: deepMotion })]);
    deepController.parameters.push({ id: "speed", name: "Speed", kind: "float", defaultValue: 0 });
    const depthResult = compileAnimatorController(deepController, () => 1);
    expect(depthResult.value).toBeNull();
    expect(depthResult.diagnostics.map((item) => item.code)).toContain("blend-tree-depth-exceeded");
  });

  it("compiles and samples nested Direct trees with normalized parameter weights", () => {
    const source = controller([state({
      motion: {
        kind: "blendTree",
        tree: {
          kind: "direct",
          normalizeWeights: true,
          children: [{
            id: "idle",
            motion: { kind: "clip", clipRef: { ...CLIP_REF, localId: "idle" }, speed: 1 },
            timeScale: 1,
            mirror: false,
            weightParameterId: "idleWeight",
          }, {
            id: "locomotion",
            motion: {
              kind: "blendTree",
              tree: {
                kind: "1d",
                parameterId: "speed",
                children: [{
                  id: "run",
                  motion: { kind: "clip", clipRef: { ...CLIP_REF, localId: "run" }, speed: 1 },
                  timeScale: 1,
                  mirror: false,
                  threshold: 1,
                }],
              },
            },
            timeScale: 1,
            mirror: false,
            weightParameterId: "moveWeight",
          }],
        },
      },
    })]);
    source.parameters.push(
      { id: "idleWeight", name: "Idle Weight", kind: "float", defaultValue: 1 },
      { id: "moveWeight", name: "Move Weight", kind: "float", defaultValue: 3 },
      { id: "speed", name: "Speed", kind: "float", defaultValue: 1 },
    );
    const result = compileAnimatorController(source, () => 1);
    const runtime = createAnimatorRuntimeState(result.value!).value!;
    const plan = buildLayerBlendPlan(result.value!, runtime);
    expect(result.diagnostics).toEqual([]);
    expect(plan.value?.instructions[0]?.clips.map(({
      sampleId: _sampleId,
      unwrappedLocalTimeSeconds: _unwrapped,
      ...sample
    }) => sample)).toEqual([
      { clipId: `${CLIP_REF.guid}:idle`, localTimeSeconds: 0, durationSeconds: 1, looping: true, weight: 0.25 },
      { clipId: `${CLIP_REF.guid}:run`, localTimeSeconds: 0, durationSeconds: 1, looping: true, weight: 0.75 },
    ]);
  });

  it("validates every parameter-driven timing and Direct weight as numeric", () => {
    const source = controller([state({
      speedParameterId: "flag",
      cycleOffsetParameterId: "flag",
      motion: {
        kind: "blendTree",
        tree: {
          kind: "direct",
          normalizeWeights: false,
          children: [{
            id: "direct",
            motion: {
              kind: "clip",
              clipRef: CLIP_REF,
              speed: 1,
              timeScaleParameterId: "flag",
            },
            timeScale: 1,
            mirror: false,
            weightParameterId: "flag",
          }],
        },
      },
    })]);
    source.parameters.push({ id: "flag", name: "Flag", kind: "boolean", defaultValue: false });
    const result = compileAnimatorController(source, () => 1);
    expect(result.value).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "missing-state-timing-parameter",
      "missing-blend-parameter",
    ]));
  });

  it("compiles mirror, foot IK, Write Defaults, interruption, layer IK, sync, and exits", () => {
    const override = state({
      mirror: true,
      footIk: true,
      writeDefaults: false,
      transitions: [{
        id: "exit",
        destination: { kind: "exit" },
        conditions: [],
        hasExitTime: false,
        exitTimeNormalized: 0,
        durationMode: "seconds",
        duration: 0,
        offsetNormalized: 0,
        interruptionSource: "none",
        orderedInterruption: true,
        canTransitionToSelf: false,
      }, {
        id: "interrupt",
        destination: { kind: "state", stateId: "idle" },
        conditions: [],
        hasExitTime: false,
        exitTimeNormalized: 0,
        durationMode: "seconds",
        duration: 0.1,
        offsetNormalized: 0,
        interruptionSource: "source",
        orderedInterruption: true,
        canTransitionToSelf: true,
      }],
    });
    const source = controller();
    source.layers.push({
      id: "upper",
      name: "Upper",
      weight: 0.6,
      blendingMode: "override",
      ikPass: true,
      syncedLayerId: "base",
      syncedLayerAffectsTiming: true,
      defaultStateId: "idle",
      states: [override],
      anyStateTransitions: [],
    });
    const result = compileAnimatorController(source, () => 1);
    expect(result.diagnostics).toEqual([]);
    const layer = result.value!.layers[1]!;
    expect(layer).toMatchObject({
      ikPass: true,
      syncedLayerId: "base",
      syncedLayerAffectsTiming: true,
    });
    expect(layer.states[0]).toMatchObject({ mirror: true, footIk: true, writeDefaults: false });
    expect(layer.transitions.map((transition) => ({
      destination: transition.destinationStateId,
      interruption: transition.interruptionSource,
    }))).toEqual([
      { destination: null, interruption: "none" },
      { destination: "idle", interruption: "source" },
    ]);
  });
});
