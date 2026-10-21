import { describe, expect, it, vi } from "vitest";
import type { AnimatorComponent } from "../../domain/animator-component";
import type { AnimatorController, AnimatorState } from "../../domain/animator-controller";
import type { AnimatorPlaybackAssets, AnimatorPoseApplier } from "./animator-playback-contracts";
import { createAnimatorPlaybackSession } from "./animator-playback-session";

const CONTROLLER_GUID = "a".repeat(32);
const MODEL_GUID = "b".repeat(32);

describe("Animator playback root-motion continuity", () => {
  it("applies root motion before procedural pose post-processing", () => {
    const order: string[] = [];
    let sample = 0;
    const pose = {
      isVisible: () => true,
      applyPose: () => {
        order.push("animation");
        return { value: { changed: true }, diagnostics: [] };
      },
      readRootMotionPose: () => {
        order.push("sample-root");
        return { value: rootPose(sample++), diagnostics: [] };
      },
      removeRootMotionFromPose: () => {
        order.push("remove-root");
        return { value: undefined, diagnostics: [] };
      },
      applyPostProcess: () => {
        order.push("ik");
        return { value: { changed: true }, diagnostics: [] };
      },
      restoreAuthoredPose: vi.fn(),
      dispose: vi.fn(),
    } satisfies AnimatorPoseApplier<string>;
    const configured = component();
    configured.rootMotion.mode = "applyToObject";
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: configured,
      assets: assets(controller([state("move", "move")]), ["move"]),
      pose,
      rootMotionObserver: { applyRootMotion: () => order.push("observe-root") },
      rootMotionSink: { applyRootMotion: () => order.push("motor") },
    }).value!;
    order.length = 0;

    session.advance({ deltaSeconds: 0.1 });

    expect(order).toEqual([
      "animation",
      "sample-root",
      "remove-root",
      "observe-root",
      "motor",
      "ik",
    ]);
    session.dispose();
  });

  it("corrects multiple forward cycles in one bounded step", () => {
    const authoredState = state("move", "move");
    authoredState.speed = 10;
    const pose = rootPoseBackend([rootPose(0), rootPose(1)], 2);
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: assets(controller([authoredState]), ["move"]),
      pose,
    }).value!;

    const step = session.advance({ deltaSeconds: 0.25 });
    expect(step.rootMotion[0]?.translation[0]).toBeCloseTo(5, 6);
    expect(pose.removeRootMotionFromPose).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("rejects ambiguous loop correction for a blended root", () => {
    const blended = state("blend", "first");
    blended.speed = 4;
    blended.motion = {
      kind: "blendTree",
      tree: {
        kind: "1d",
        parameterId: "blend",
        children: [
          { id: "first", threshold: 0, timeScale: 1, mirror: false, motion: clipMotion("first") },
          { id: "second", threshold: 1, timeScale: 1, mirror: false, motion: clipMotion("second") },
        ],
      },
    };
    const source = controller([blended]);
    source.parameters = [{ id: "blend", name: "Blend", kind: "float", defaultValue: 0.5 }];
    const pose = rootPoseBackend([rootPose(0), rootPose(100)], 2);
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: assets(source, ["first", "second"]),
      pose,
    }).value!;

    const step = session.advance({ deltaSeconds: 0.25 });
    expect(step.rootMotion).toEqual([]);
    expect(step.diagnostics.map((item) => item.code))
      .toContain("ambiguous-blended-root-motion-loop");
    expect(pose.removeRootMotionFromPose).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("resets extraction across an instantaneous state discontinuity", () => {
    const before = state("before", "before");
    before.transitions = [{
      id: "instant",
      destination: { kind: "state", stateId: "after" },
      conditions: [],
      hasExitTime: false,
      exitTimeNormalized: 0,
      durationMode: "seconds",
      duration: 0,
      offsetNormalized: 0,
      interruptionSource: "none",
      orderedInterruption: true,
      canTransitionToSelf: false,
    }];
    const pose = rootPoseBackend([rootPose(0), rootPose(100)], 2);
    const session = createAnimatorPlaybackSession({
      characterId: "hero",
      component: component(),
      assets: assets(controller([before, state("after", "after")]), ["before", "after"]),
      pose,
    }).value!;

    const step = session.advance({ deltaSeconds: 0.1 });
    expect(step.rootMotion).toEqual([]);
    expect(step.diagnostics.map((item) => item.code))
      .toContain("root-motion-sample-discontinuity");
    expect(pose.removeRootMotionFromPose).toHaveBeenCalledTimes(2);
    session.dispose();
  });
});

function component(): AnimatorComponent {
  return {
    version: 1,
    enabled: true,
    controllerRef: { guid: CONTROLLER_GUID, localId: "main" },
    rootMotion: {
      mode: "extractOnly",
      source: "hips",
      translationAxes: { x: true, y: true, z: true },
      rotation: "full",
      bakeIntoPose: false,
    },
    updateMode: "normal",
    cullingMode: "alwaysAnimate",
    parameterOverrides: [],
  };
}

function controller(states: AnimatorState[]): AnimatorController {
  return {
    version: 1,
    id: CONTROLLER_GUID,
    name: "Controller",
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

function state(id: string, clipId: string): AnimatorState {
  return {
    id,
    name: id,
    motion: clipMotion(clipId),
    speed: 1,
    cycleOffset: 0,
    mirror: false,
    footIk: false,
    writeDefaults: true,
    transitions: [],
    events: [],
  };
}

function clipMotion(localId: string) {
  return {
    kind: "clip" as const,
    clipRef: { guid: MODEL_GUID, localId },
    speed: 1,
  };
}

function assets(source: AnimatorController, clipIds: string[]): AnimatorPlaybackAssets<string> {
  return {
    controller: source,
    clips: clipIds.map((localId) => ({
      id: `${MODEL_GUID}:${localId}`,
      resource: localId,
      metadata: { durationSeconds: 1, looping: true, events: [] },
    })),
    masks: [],
  };
}

function rootPoseBackend(poses: ReturnType<typeof rootPose>[], cycleEnd: number) {
  let index = 0;
  return {
    isVisible: () => true,
    applyPose: () => ({ value: { changed: true }, diagnostics: [] }),
    readRootMotionPose: () => ({
      value: poses[Math.min(index++, poses.length - 1)]!,
      diagnostics: [],
    }),
    readRootMotionLoopBoundary: () => ({
      value: { cycleStart: rootPose(0), cycleEnd: rootPose(cycleEnd) },
      diagnostics: [],
    }),
    removeRootMotionFromPose: vi.fn(() => ({ value: undefined, diagnostics: [] })),
    restoreAuthoredPose: vi.fn(),
    dispose: vi.fn(),
  } satisfies AnimatorPoseApplier<string>;
}

function rootPose(x: number) {
  return {
    position: [x, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  };
}
