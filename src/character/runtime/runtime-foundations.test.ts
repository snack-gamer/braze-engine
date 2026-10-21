import { describe, expect, it } from "vitest";
import { collectAnimationEvents } from "./animation-events";
import { compileAxisAlignment } from "./axis-alignment";
import {
  advanceAnimatorRuntime,
  createAnimatorRuntimeState,
  withAnimatorParameter,
  type RuntimeAnimatorControllerDefinition,
  type RuntimeAnimatorMotion,
} from "./animator-runtime";
import { sampleRuntimeAnimatorMotion } from "./animator-motion-sampler";
import { evaluateBlendTree1d } from "./blend-tree-1d";
import { buildLayerBlendPlan } from "./layer-blend-plan";
import { retargetCacheKey, type RetargetCacheIdentity } from "./retarget-cache-key";
import { applyRootMotionDelta, extractRootMotionDelta } from "./root-motion";
import { rotateCharacterVector } from "./pose-math";

function controller(): RuntimeAnimatorControllerDefinition {
  return {
    id: "locomotion",
    revision: "controller-r1",
    parameters: [
      { name: "speed", type: "float", defaultValue: 0 },
      { name: "jump", type: "trigger", defaultValue: false },
    ],
    layers: [{
      id: "base",
      initialStateId: "idle",
      weight: 1,
      blendMode: "override",
      states: [
        { id: "idle", motion: {
          kind: "clip", clipId: "idle-clip", durationSeconds: 1, timeScale: 1, looping: true,
        }, durationSeconds: 1, speed: 1, loop: true },
        { id: "walk", motion: { kind: "blendTree1d", parameter: "speed", children: [
          { id: "walk", threshold: 1, timeScale: 1, motion: {
            kind: "clip", clipId: "walk-clip", durationSeconds: 1, timeScale: 1, looping: true,
          } },
          { id: "run", threshold: 4, timeScale: 1, motion: {
            kind: "clip", clipId: "run-clip", durationSeconds: 0.7, timeScale: 1, looping: true,
          } },
        ] }, durationSeconds: 1, speed: 1, loop: true },
        { id: "jump", motion: {
          kind: "clip", clipId: "jump-clip", durationSeconds: 0.6, timeScale: 1, looping: false,
        }, durationSeconds: 0.6, speed: 1, loop: false },
      ],
      transitions: [
        {
          id: "any-to-jump",
          sourceStateId: "*",
          destinationStateId: "jump",
          durationSeconds: 0,
          conditions: [{ parameter: "jump", operator: "triggered" }],
        },
        {
          id: "idle-to-walk",
          sourceStateId: "idle",
          destinationStateId: "walk",
          durationSeconds: 0.2,
          conditions: [{ parameter: "speed", operator: "greater", value: 0.1 }],
        },
      ],
    }],
  };
}

describe("character runtime foundations", () => {
  it("chooses transitions deterministically by authoring order and consumes triggers once", () => {
    const definition = controller();
    let state = createAnimatorRuntimeState(definition).value!;
    state = withAnimatorParameter(definition, state, "speed", 2).value!;
    state = withAnimatorParameter(definition, state, "jump", true).value!;

    const first = advanceAnimatorRuntime(definition, state, 1 / 60).value!;
    expect(first.firedTransitionIds).toEqual(["any-to-jump"]);
    expect(first.consumedTriggers).toEqual(["jump"]);
    expect(first.state.layers[0]?.currentStateId).toBe("jump");
    expect(first.state.parameters.jump).toBe(false);

    const second = advanceAnimatorRuntime(definition, first.state, 1 / 60).value!;
    expect(second.firedTransitionIds).toEqual([]);
    expect(second.state.layers[0]?.currentStateId).toBe("jump");
  });

  it("produces normalized 1D and transition blend weights", () => {
    const weights = evaluateBlendTree1d([
      { motionId: "walk", threshold: 1 },
      { motionId: "run", threshold: 3 },
    ], 2).value!;
    expect(weights).toEqual([
      { motionId: "walk", weight: 0.5 },
      { motionId: "run", weight: 0.5 },
    ]);

    const definition = controller();
    let state = createAnimatorRuntimeState(definition, { speed: 2 }).value!;
    state = advanceAnimatorRuntime(definition, state, 0.1).value!.state;
    state = advanceAnimatorRuntime(definition, state, 0.1).value!.state;
    const plan = buildLayerBlendPlan(definition, state).value!;
    const total = plan.instructions[0]!.clips.reduce((sum, clip) => sum + clip.weight, 0);
    expect(total).toBeCloseTo(1);
  });

  it("invalidates retarget artifacts for every semantic revision input", () => {
    const identity: RetargetCacheIdentity = {
      sourceClipRevision: "clip-1",
      sourceSkeletonRevision: "source-rig-1",
      sourceAvatarRevision: "source-avatar-1",
      targetSkeletonRevision: "target-rig-1",
      targetAvatarRevision: "target-avatar-1",
      settingsRevision: "settings-1",
      compilerVersion: "compiler-1",
    };
    const original = retargetCacheKey(identity);
    for (const field of Object.keys(identity) as Array<keyof RetargetCacheIdentity>) {
      expect(retargetCacheKey({ ...identity, [field]: `${identity[field]}-changed` })).not.toBe(original);
    }
    expect(retargetCacheKey(identity)).toBe(original);
  });

  it("extracts loop-continuous root motion and ignores quaternion sign aliases", () => {
    const identity = [0, 0, 0, 1] as const;
    const negativeIdentity = [0, 0, 0, -1] as const;
    const delta = extractRootMotionDelta(
      { position: [9, 0, 0], rotation: identity },
      { position: [1, 0, 0], rotation: negativeIdentity },
      {
        cycleStart: { position: [0, 0, 0], rotation: identity },
        cycleEnd: { position: [10, 0, 0], rotation: identity },
      },
    ).value!;
    expect(delta.translation).toEqual([2, 0, 0]);
    expect(delta.rotation).toEqual(identity);
    expect(applyRootMotionDelta({ position: [4, 0, 0], rotation: identity }, delta).value?.position)
      .toEqual([6, 0, 0]);
  });

  it("aligns declared Avatar axes without Three-specific math", () => {
    const alignment = compileAxisAlignment("+z", "+y", "-z", "+y");
    const forward = rotateCharacterVector(alignment.value!, [0, 0, 1]);
    expect(forward[0]).toBeCloseTo(0);
    expect(forward[1]).toBeCloseTo(0);
    expect(forward[2]).toBeCloseTo(-1);
    expect(compileAxisAlignment("+y", "+y", "+z", "+y").value).toBeNull();
  });

  it("orders animation events across forward and reverse loop boundaries", () => {
    const events = [
      { id: "start", name: "Start", timeSeconds: 0.1 },
      { id: "end", name: "End", timeSeconds: 0.9 },
    ];
    expect(collectAnimationEvents(events, 0.8, 1.2, { durationSeconds: 1, looping: true }).fired
      .map((item) => item.event.id)).toEqual(["end", "start"]);
    expect(collectAnimationEvents(events, 1.2, 0.8, { durationSeconds: 1, looping: true }).fired
      .map((item) => item.event.id)).toEqual(["start", "end"]);
  });

  it("bounds large event catch-up ranges and includes exact clip-end events", () => {
    const catchUp = collectAnimationEvents(
      [{ id: "tick", name: "Tick", timeSeconds: 0.25 }],
      0,
      1_000_000,
      { durationSeconds: 1, looping: true, maxEvents: 3 },
    );
    expect(catchUp.fired.map((item) => item.occurrenceTimeSeconds)).toEqual([0.25, 1.25, 2.25]);
    expect(catchUp.truncated).toBe(true);
    expect(collectAnimationEvents(
      [{ id: "end", name: "End", timeSeconds: 1 }],
      0,
      1,
      { durationSeconds: 1, looping: false },
    ).fired.map((item) => item.event.id)).toEqual(["end"]);
  });

  it("diagnoses cyclic runtime trees instead of recursing or silently sampling", () => {
    const cyclic = {
      kind: "blendTree1d",
      parameter: "speed",
      children: [],
    } as unknown as Extract<RuntimeAnimatorMotion, { kind: "blendTree1d" }>;
    (cyclic.children as Array<unknown>).push({
      id: "cycle",
      threshold: 0,
      timeScale: 1,
      motion: cyclic,
    });
    const result = sampleRuntimeAnimatorMotion(cyclic, 0, { speed: 0 });
    expect(result.value).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toContain("cyclic-runtime-blend-tree");
  });
});
