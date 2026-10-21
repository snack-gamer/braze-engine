import { describe, expect, it, vi } from "vitest";
import type { AnimatorComponent } from "../../domain/animator-component";
import type { AnimatorController } from "../../domain/animator-controller";
import type { LayerBlendPlan } from "../../runtime/layer-blend-plan";
import type { RootMotionPose, RootMotionSink } from "../../runtime/root-motion";
import type {
  AnimatorPlaybackAssets,
  AnimatorPoseApplier,
} from "./animator-playback-contracts";
import { createAnimatorPlaybackSession } from "./animator-playback-session";

const CONTROLLER_GUID = "a".repeat(32);
const MODEL_GUID = "b".repeat(32);
const CLIP_ID = `${MODEL_GUID}:clip:Walk`;

function controller(): AnimatorController {
  return {
    version: 1,
    id: CONTROLLER_GUID,
    name: "Locomotion",
    revision: "revision-1",
    parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }],
    layers: [{
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "walk",
      anyStateTransitions: [],
      states: [{
        id: "walk",
        name: "Walk",
        motion: {
          kind: "clip",
          clipRef: { guid: MODEL_GUID, localId: "clip:Walk" },
          speed: 1,
        },
        speed: 1,
        cycleOffset: 0,
        mirror: false,
        footIk: false,
        writeDefaults: true,
        transitions: [],
        events: [],
      }],
    }],
  };
}

function component(patch: Partial<AnimatorComponent> = {}): AnimatorComponent {
  return {
    version: 1,
    enabled: true,
    controllerRef: { guid: CONTROLLER_GUID, localId: "main" },
    rootMotion: {
      mode: "disabled",
      source: "clip",
      translationAxes: { x: true, y: true, z: true },
      rotation: "yaw",
      bakeIntoPose: false,
    },
    updateMode: "normal",
    cullingMode: "alwaysAnimate",
    parameterOverrides: [],
    ...patch,
  };
}

function assets(durationSeconds = 2): AnimatorPlaybackAssets<string> {
  return {
    controller: controller(),
    clips: [{
      id: CLIP_ID,
      resource: "walk-resource",
      metadata: {
        durationSeconds,
        looping: true,
        events: [{ id: "step", name: "Footstep", timeSeconds: 0.5, payload: {} }],
      },
    }],
    masks: [],
  };
}

function blendTreeAssets(): AnimatorPlaybackAssets<string> {
  const endpointClipId = `${MODEL_GUID}:clip:Run`;
  const blendController: AnimatorController = {
    ...controller(),
    layers: [{
      ...controller().layers[0]!,
      states: [{
        ...controller().layers[0]!.states[0]!,
        motion: {
          kind: "blendTree",
          tree: {
            kind: "1d",
            parameterId: "speed",
            children: [
              {
                id: "walk-child",
                threshold: 0,
                timeScale: 1,
                mirror: false,
                motion: {
                  kind: "clip",
                  clipRef: { guid: MODEL_GUID, localId: "clip:Walk" },
                  speed: 1,
                },
              },
              {
                id: "run-child",
                threshold: 1,
                timeScale: 1,
                mirror: false,
                motion: {
                  kind: "clip",
                  clipRef: { guid: MODEL_GUID, localId: "clip:Run" },
                  speed: 1,
                },
              },
            ],
          },
        },
      }],
    }],
  };
  return {
    controller: blendController,
    clips: [
      ...assets().clips,
      {
        id: endpointClipId,
        resource: "run-resource",
        metadata: { durationSeconds: 1, looping: true, events: [] },
      },
    ],
    masks: [],
  };
}

function poseApplier(poses: RootMotionPose[] = []) {
  let poseIndex = 0;
  const appliedTimes: number[] = [];
  return {
    appliedTimes,
    isVisible: () => true,
    applyPose: ({ plan }) => {
      appliedTimes.push(plan.instructions[0]?.clips[0]?.localTimeSeconds ?? -1);
      return { value: { changed: true }, diagnostics: [] };
    },
    readRootMotionPose: () => ({
      value: poses[Math.min(poseIndex++, poses.length - 1)] ?? null,
      diagnostics: [],
    }),
    readRootMotionLoopBoundary: () => ({
      value: {
        cycleStart: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
        cycleEnd: { position: [1, 0, 0], rotation: [0, 0, 0, 1] },
      },
      diagnostics: [],
    }),
    removeRootMotionFromPose: vi.fn(() => ({ value: undefined, diagnostics: [] })),
    restoreAuthoredPose: vi.fn(),
    dispose: vi.fn(),
  } satisfies AnimatorPoseApplier<string> & { appliedTimes: number[] };
}

describe("AnimatorPlaybackSession", () => {
  it("advances deterministically from the shared frame cadence and restores on disposal", () => {
    const fastPose = poseApplier();
    const slowPose = poseApplier();
    const fast = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component({ updateMode: "fixedStep" }),
      assets: assets(10),
      pose: fastPose,
      fixedStepSeconds: 1 / 60,
    }).value!;
    const slow = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component({ updateMode: "fixedStep" }),
      assets: assets(10),
      pose: slowPose,
      fixedStepSeconds: 1 / 60,
    }).value!;

    for (let frame = 0; frame < 60; frame += 1) fast.advance({ deltaSeconds: 1 / 60 });
    for (let frame = 0; frame < 30; frame += 1) slow.advance({ deltaSeconds: 1 / 30 });
    expect(fastPose.appliedTimes[fastPose.appliedTimes.length - 1]).toBeCloseTo(1, 6);
    expect(slowPose.appliedTimes[slowPose.appliedTimes.length - 1]).toBeCloseTo(1, 6);

    fast.dispose();
    fast.dispose();
    expect(fastPose.restoreAuthoredPose).toHaveBeenCalledOnce();
    expect(fastPose.dispose).toHaveBeenCalledOnce();
    expect(fast.advance({ deltaSeconds: 1 / 60 }).diagnostics[0]?.code)
      .toBe("disposed-animator-session");
  });

  it("rejects a typed gameplay command aimed at another parameter kind", () => {
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: assets(),
      pose: poseApplier(),
    }).value!;

    expect(session.setParameter("speed", 2, "float").value).toBeUndefined();
    const mismatch = session.setParameter("speed", 2, "int");
    expect(mismatch.value).toBeNull();
    expect(mismatch.diagnostics[0]?.code).toBe("animator-parameter-command-type-mismatch");
    session.dispose();
  });

  it("applies a preview parameter before the initial Blend Tree pose", () => {
    const endpointClipId = `${MODEL_GUID}:clip:Run`;
    const plans: LayerBlendPlan[] = [];
    const pose = poseApplier();
    pose.applyPose = ({ plan }) => {
      plans.push(plan);
      return { value: { changed: true }, diagnostics: [] };
    };
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: blendTreeAssets(),
      pose,
      launchValues: { speed: 1 },
    }).value!;

    expect(session.runtimeStateSnapshot().parameters.speed).toBe(1);
    expect(plans[0]?.instructions[0]?.clips).toEqual([expect.objectContaining({
      clipId: endpointClipId,
      weight: 1,
    })]);
    session.dispose();
  });

  it("reapplies a paused 1D Blend Tree at its midpoint and endpoint without advancing time", () => {
    const plans: LayerBlendPlan[] = [];
    const pose = poseApplier();
    pose.applyPose = ({ plan }) => {
      plans.push(plan);
      return { value: { changed: true }, diagnostics: [] };
    };
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: blendTreeAssets(),
      pose,
    }).value!;

    expect(session.setParameter("speed", 0.5, "float").value).toBeUndefined();
    expect(plans[plans.length - 1]?.instructions[0]?.clips).toEqual([
      expect.objectContaining({ clipId: CLIP_ID, weight: 0.5 }),
      expect.objectContaining({ clipId: `${MODEL_GUID}:clip:Run`, weight: 0.5 }),
    ]);
    expect(session.runtimeStateSnapshot().layers[0]?.stateTimeSeconds).toBe(0);

    expect(session.setParameter("speed", 1, "float").value).toBeUndefined();
    expect(plans[plans.length - 1]?.instructions[0]?.clips).toEqual([
      expect.objectContaining({ clipId: `${MODEL_GUID}:clip:Run`, weight: 1 }),
    ]);
    expect(session.runtimeStateSnapshot().layers[0]?.stateTimeSeconds).toBe(0);
    session.dispose();
  });

  it("exposes immutable live state with the exact compiled Clip duration", () => {
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: assets(2.5),
      pose: poseApplier(),
    }).value!;

    const initial = session.runtimeStateSnapshot();
    session.advance({ deltaSeconds: 0.25 });

    expect(session.runtimeStateSnapshot()).not.toBe(initial);
    expect(session.runtimeStateSnapshot().layers[0]?.stateTimeSeconds).toBeCloseTo(0.25, 6);
    expect(session.runtimeControllerDefinition().layers[0]?.states[0]?.durationSeconds).toBe(2.5);
    session.dispose();
  });

  it("delivers bounded clip events once as plan time crosses their marker", () => {
    const onEvent = vi.fn();
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: assets(),
      pose: poseApplier(),
      onEvent,
    }).value!;

    expect(session.advance({ deltaSeconds: 0.1 }).events).toEqual([]);
    expect(session.advance({ deltaSeconds: 0.2 }).events).toEqual([]);
    const crossed = session.advance({ deltaSeconds: 0.2 });
    expect(crossed.events.map((event) => event.event.name)).toEqual(["Footstep"]);
    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("forwards authored state events through the same bounded gameplay port", () => {
    const authored = controller();
    authored.layers[0]!.states[0]!.events = [{
      id: "state-step",
      name: "State Footstep",
      timeNormalized: 0.25,
      payload: { foot: "left" },
    }];
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: { ...assets(), controller: authored },
      pose: poseApplier(),
    }).value!;

    // Normal mode deliberately clamps one large display gap to 0.25 seconds.
    expect(session.advance({ deltaSeconds: 0.5 }).events).toEqual([]);
    const crossed = session.advance({ deltaSeconds: 0.25 });
    expect(crossed.events).toContainEqual({
      kind: "state",
      characterId: "hero",
      layerId: "base",
      stateId: "walk",
      event: {
        id: "state-step",
        name: "State Footstep",
        timeSeconds: 0.5,
        payload: { foot: "left" },
      },
    });
  });

  it("normalizes non-finite event limits and isolates listener failures", () => {
    const authoredAssets = assets();
    authoredAssets.clips[0]!.metadata.events = Array.from({ length: 160 }, (_, index) => ({
      id: `event-${index}`,
      name: `Event ${index}`,
      timeSeconds: 0.1,
      payload: {},
    }));
    const onEvent = vi.fn(() => {
      throw new Error("listener failure");
    });
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: authoredAssets,
      pose: poseApplier(),
      maxEventsPerFrame: Number.NaN,
      onEvent,
    }).value!;

    const step = session.advance({ deltaSeconds: 0.2 });

    expect(step.events).toHaveLength(128);
    expect(onEvent).toHaveBeenCalledTimes(128);
    expect(step.diagnostics.filter((item) => item.code === "animation-event-callback-failed"))
      .toHaveLength(1);
  });

  it("extracts filtered root motion through a sink and removes it from the pose", () => {
    const rootMotionSink: RootMotionSink = { applyRootMotion: vi.fn() };
    const pose = poseApplier([
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
    ]);
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component({
        rootMotion: {
          mode: "applyToObject",
          source: "hips",
          translationAxes: { x: true, y: false, z: true },
          rotation: "none",
          bakeIntoPose: false,
        },
      }),
      assets: assets(),
      pose,
      rootMotionSink,
    }).value!;

    const moved = session.advance({ deltaSeconds: 0.1 });
    expect(moved.rootMotion[0]?.translation).toEqual([1, 0, 3]);
    expect(rootMotionSink.applyRootMotion).toHaveBeenCalledWith(expect.objectContaining({
      characterId: "hero",
      delta: expect.objectContaining({ translation: [1, 0, 3] }),
    }));
    expect(pose.removeRootMotionFromPose).toHaveBeenCalled();
  });

  it("corrects reverse loop-boundary root motion without a discontinuity", () => {
    const authored = controller();
    authored.layers[0]!.states[0]!.speed = -1;
    const pose = poseApplier(Array.from({ length: 16 }, () => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })));
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component({
        rootMotion: {
          mode: "extractOnly",
          source: "hips",
          translationAxes: { x: true, y: true, z: true },
          rotation: "yaw",
          bakeIntoPose: false,
        },
      }),
      assets: { ...assets(1), controller: authored },
      pose,
    }).value!;

    const steps = Array.from({ length: 12 }, () => session.advance({ deltaSeconds: 0.1 }));
    expect(steps.flatMap((step) => step.diagnostics).map((item) => item.code))
      .not.toContain("root-motion-loop-boundary-unavailable");
    expect(steps.flatMap((step) => step.rootMotion)
      .reduce((sum, delta) => sum + delta.translation[0], 0)).toBeLessThan(0);
  });

  it("returns diagnostics for unresolved clips instead of throwing", () => {
    const unresolved = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: { ...assets(), clips: [] },
      pose: poseApplier(),
    });
    expect(unresolved.value).toBeNull();
    expect(unresolved.diagnostics.map((item) => item.code)).toContain("missing-animation-clip");
  });
});
