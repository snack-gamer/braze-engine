import { describe, expect, it } from "vitest";
import type { AnimatorController, AnimatorState } from "../domain/animator-controller";
import {
  advanceAnimatorRuntime,
  createAnimatorRuntimeState,
  withAnimatorParameter,
  type AnimatorRuntimeState,
  type RuntimeAnimatorMotion,
} from "./animator-runtime";
import { compileAnimatorController } from "./animator-controller-compiler";
import { sampleRuntimeAnimatorMotion } from "./animator-motion-sampler";
import { buildLayerBlendPlan } from "./layer-blend-plan";

const CLIP_GUID = "c".repeat(32);

function authoredState(overrides: Partial<AnimatorState> = {}): AnimatorState {
  return {
    id: "idle",
    name: "Idle",
    motion: {
      kind: "clip",
      clipRef: { guid: CLIP_GUID, localId: "idle" },
      speed: 1,
    },
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

function authoredController(states: AnimatorState[]): AnimatorController {
  return {
    version: 1,
    id: "authored-semantics",
    name: "Authored Semantics",
    revision: "r1",
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

describe("authored Animator runtime semantics", () => {
  it("uses parameter-driven state speed, cycle offset, and clip time scale", () => {
    const source = authoredController([authoredState({
      motion: {
        kind: "clip",
        clipRef: { guid: CLIP_GUID, localId: "idle" },
        speed: 4,
        timeScaleParameterId: "clipScale",
      },
      speed: 3,
      speedParameterId: "stateSpeed",
      cycleOffset: 0.8,
      cycleOffsetParameterId: "phase",
    })]);
    source.parameters.push(
      { id: "stateSpeed", name: "State Speed", kind: "float", defaultValue: 0.5 },
      { id: "phase", name: "Phase", kind: "float", defaultValue: 0.2 },
      { id: "clipScale", name: "Clip Scale", kind: "float", defaultValue: 2 },
    );
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 10, looping: true }));
    const initial = createAnimatorRuntimeState(compiled.value!).value!;
    const advanced = advanceAnimatorRuntime(compiled.value!, initial, 2).value!;
    const plan = buildLayerBlendPlan(compiled.value!, advanced.state).value!;

    expect(compiled.diagnostics).toEqual([]);
    expect(advanced.state.layers[0]?.stateTimeSeconds).toBe(0.5);
    expect(plan.instructions[0]?.clips[0]?.localTimeSeconds).toBeCloseTo(4, 8);
  });

  it("starts transition destinations at their authored normalized offset", () => {
    const idle = authoredState({
      transitions: [{
        id: "idle-to-run",
        destination: { kind: "state", stateId: "run" },
        conditions: [],
        hasExitTime: false,
        exitTimeNormalized: 0,
        durationMode: "seconds",
        duration: 0,
        offsetNormalized: 0.75,
        interruptionSource: "none",
        orderedInterruption: true,
        canTransitionToSelf: false,
      }],
    });
    const run = authoredState({
      id: "run",
      name: "Run",
      motion: { kind: "clip", clipRef: { guid: CLIP_GUID, localId: "run" }, speed: 1 },
    });
    const compiled = compileAnimatorController(
      authoredController([idle, run]),
      () => ({ durationSeconds: 2, looping: true }),
    ).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const advanced = advanceAnimatorRuntime(compiled, initial, 0.1).value!;
    const plan = buildLayerBlendPlan(compiled, advanced.state).value!;

    expect(advanced.firedTransitionIds).toEqual(["idle-to-run"]);
    expect(advanced.state.layers[0]?.stateTimeSeconds).toBe(1.5);
    expect(plan.instructions[0]?.clips[0]).toMatchObject({
      clipId: `${CLIP_GUID}:run`,
      localTimeSeconds: 1.5,
    });
  });

  it("reports authored state events deterministically and bounds delivery", () => {
    const source = authoredController([authoredState({
      events: [
        { id: "authored-first", name: "First", timeNormalized: 0.25, payload: { order: 1 } },
        { id: "lexically-first", name: "Second", timeNormalized: 0.25, payload: { order: 2 } },
        { id: "late", name: "Late", timeNormalized: 0.75, payload: {} },
      ],
    })]);
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 1, looping: true })).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const bounded = advanceAnimatorRuntime(compiled, initial, 0.8, { maxStateEvents: 2 }).value!;

    expect(bounded.firedStateEvents.map((event) => event.eventId))
      .toEqual(["authored-first", "lexically-first"]);
    expect(bounded.eventsTruncated).toBe(true);
    const looped = advanceAnimatorRuntime(compiled, bounded.state, 0.5).value!;
    expect(looped.firedStateEvents.map((event) => [event.eventId, event.occurrenceTimeSeconds]))
      .toEqual([
        ["authored-first", 1.25],
        ["lexically-first", 1.25],
      ]);
  });

  it("reports state events in reverse timeline order", () => {
    const source = authoredController([authoredState({
      speed: -1,
      events: [
        { id: "early", name: "Early", timeNormalized: 0.25, payload: {} },
        { id: "late", name: "Late", timeNormalized: 0.75, payload: {} },
      ],
    })]);
    const compiled = compileAnimatorController(source, () => ({ durationSeconds: 1, looping: true })).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const positioned: AnimatorRuntimeState = {
      ...initial,
      layers: [{ ...initial.layers[0]!, stateTimeSeconds: 0.8 }],
    };
    const reversed = advanceAnimatorRuntime(compiled, positioned, 0.6).value!;
    expect(reversed.firedStateEvents.map((event) => event.eventId)).toEqual(["late", "early"]);
  });

  it("keeps nested Direct evaluation within the clip sample budget", () => {
    const children = Array.from({ length: 257 }, (_, index) => ({
      id: `child-${index}`,
      weightParameter: `weight-${index}`,
      timeScale: 1,
      motion: {
        kind: "clip" as const,
        clipId: `clip-${index}`,
        durationSeconds: 1,
        timeScale: 1,
        looping: true,
      },
    }));
    const motion: RuntimeAnimatorMotion = {
      kind: "blendTreeDirect",
      normalizeWeights: false,
      children,
    };
    const parameters = Object.fromEntries(children.map((child) => [child.weightParameter, 1]));
    const sampled = sampleRuntimeAnimatorMotion(motion, 0, parameters);
    expect(sampled.value).toBeNull();
    expect(sampled.diagnostics.map((item) => item.code)).toContain("blend-tree-sample-budget-exceeded");
  });

  it("balances synchronized override duration and samples matching normalized time", () => {
    const source = authoredController([authoredState()]);
    source.layers.push({
      id: "override",
      name: "Override",
      weight: 0.5,
      blendingMode: "override",
      ikPass: false,
      syncedLayerId: "base",
      syncedLayerAffectsTiming: true,
      defaultStateId: "idle",
      states: [authoredState({
        motion: { kind: "clip", clipRef: { guid: CLIP_GUID, localId: "slow" }, speed: 1 },
      })],
      anyStateTransitions: [],
    });
    const compiled = compileAnimatorController(source, (ref) => ({
      durationSeconds: ref.localId === "slow" ? 3 : 1,
      looping: false,
    })).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const advanced = advanceAnimatorRuntime(compiled, initial, 1).value!.state;
    const plan = buildLayerBlendPlan(compiled, advanced).value!;

    expect(advanced.layers.map((layer) => layer.stateTimeSeconds)).toEqual([0.5, 0.5]);
    expect(plan.instructions[0]?.clips[0]?.localTimeSeconds).toBeCloseTo(0.5, 8);
    expect(plan.instructions[1]?.clips[0]?.localTimeSeconds).toBeCloseTo(1.5, 8);
  });

  it("uses the active synchronized override motion when that layer affects timing", () => {
    const source = authoredController([authoredState()]);
    source.parameters.push({ id: "pace", name: "Pace", kind: "float", defaultValue: 0 });
    source.layers.push({
      id: "override",
      name: "Override",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      syncedLayerId: "base",
      syncedLayerAffectsTiming: true,
      defaultStateId: "idle",
      states: [authoredState({ motion: {
        kind: "blendTree",
        tree: {
          kind: "1d",
          parameterId: "pace",
          children: [
            {
              id: "two",
              threshold: 0,
              motion: {
                kind: "clip",
                clipRef: { guid: CLIP_GUID, localId: "two" },
                speed: 1,
                loopMode: "loop",
              },
              timeScale: 1,
              mirror: false,
            },
            {
              id: "four",
              threshold: 1,
              motion: {
                kind: "clip",
                clipRef: { guid: CLIP_GUID, localId: "four" },
                speed: 1,
                loopMode: "loop",
              },
              timeScale: 1,
              mirror: false,
            },
          ],
        },
      } })],
      anyStateTransitions: [],
    });
    const compiled = compileAnimatorController(source, (ref) => ({
      durationSeconds: ref.localId === "two" ? 2 : ref.localId === "four" ? 4 : 1,
      looping: true,
    })).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const fast = advanceAnimatorRuntime(compiled, initial, 1).value!.state;
    const slowInitial = withAnimatorParameter(compiled, initial, "pace", 1).value!;
    const slow = advanceAnimatorRuntime(compiled, slowInitial, 1).value!.state;

    expect(fast.layers.map((layer) => layer.stateTimeSeconds)).toEqual([0.5, 0.5]);
    expect(slow.layers.map((layer) => layer.stateTimeSeconds)).toEqual([0.25, 0.25]);
    expect(buildLayerBlendPlan(compiled, fast).value!.instructions[1]?.clips[0]?.localTimeSeconds)
      .toBeCloseTo(1, 8);
    expect(buildLayerBlendPlan(compiled, slow).value!.instructions[1]?.clips[0]?.localTimeSeconds)
      .toBeCloseTo(1, 8);
  });

  it("fades a higher layer through Exit and then deactivates it", () => {
    const source = authoredController([authoredState()]);
    source.layers.push({
      id: "gesture",
      name: "Gesture",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "idle",
      states: [authoredState({ transitions: [{
        id: "exit-gesture",
        destination: { kind: "exit" },
        conditions: [],
        hasExitTime: false,
        exitTimeNormalized: 0,
        durationMode: "seconds",
        duration: 0.2,
        offsetNormalized: 0,
        interruptionSource: "none",
        orderedInterruption: true,
        canTransitionToSelf: false,
      }] })],
      anyStateTransitions: [],
    });
    const compiled = compileAnimatorController(source, () => 1).value!;
    const initial = createAnimatorRuntimeState(compiled).value!;
    const started = advanceAnimatorRuntime(compiled, initial, 0.1).value!.state;
    const fading = advanceAnimatorRuntime(compiled, started, 0.1).value!.state;
    const exited = advanceAnimatorRuntime(compiled, fading, 0.1).value!.state;

    expect(fading.layers[1]?.transition?.toStateId).toBeNull();
    expect(buildLayerBlendPlan(compiled, fading).value!.instructions[1]?.clips[0]?.weight)
      .toBeCloseTo(0.5, 8);
    expect(exited.layers[1]?.active).toBe(false);
    expect(buildLayerBlendPlan(compiled, exited).value!.instructions).toHaveLength(1);
  });

  it("honors ordered interruption as a queue cutoff", () => {
    const create = (orderedInterruption: boolean) => {
      const a = authoredState({
        id: "a",
        transitions: [transition("to-b", "b", "goB", orderedInterruption), transition("to-c", "c", "goC", true)],
      });
      const source = authoredController([a, authoredState({ id: "b" }), authoredState({ id: "c" })]);
      source.parameters.push(
        { id: "goB", name: "Go B", kind: "trigger", defaultValue: false },
        { id: "goC", name: "Go C", kind: "trigger", defaultValue: false },
      );
      return compileAnimatorController(source, () => 1).value!;
    };
    const advance = (ordered: boolean) => {
      const compiled = create(ordered);
      const initial = createAnimatorRuntimeState(compiled, { goB: true }).value!;
      const blending = advanceAnimatorRuntime(compiled, initial, 0.1).value!.state;
      const armed = withAnimatorParameter(compiled, blending, "goC", true).value!;
      return advanceAnimatorRuntime(compiled, armed, 0.1).value!.state.layers[0]!;
    };

    expect(advance(true).transition?.id).toBe("to-b");
    expect(advance(false).transition?.id).toBe("to-c");
  });
});

function transition(id: string, destination: string, trigger: string, orderedInterruption: boolean) {
  return {
    id,
    destination: { kind: "state" as const, stateId: destination },
    conditions: [{ parameterId: trigger, mode: "triggered" as const }],
    hasExitTime: false,
    exitTimeNormalized: 0,
    durationMode: "seconds" as const,
    duration: 1,
    offsetNormalized: 0,
    interruptionSource: "source" as const,
    orderedInterruption,
    canTransitionToSelf: false,
  };
}
