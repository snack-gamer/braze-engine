import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { SceneObject } from "../scene/domain/scene-object";
import type { Runtime } from "../three/runtime";
import type { AnimatorComponent } from "../character/domain/animator-component";
import type { AnimatorController } from "../character/domain/animator-controller";
import {
  createAnimatorPlaybackSession,
} from "../character/application/playback/animator-playback-session";
import type {
  AnimatorPlaybackAssets,
  AnimatorPlaybackClip,
  AnimatorPoseApplication,
  AnimatorPoseApplier,
} from "../character/application/playback/animator-playback-contracts";
import {
  ThreeAnimatorActionCache,
  type ThreeAnimatorClipResource,
} from "../character/adapters/three/three-animator-action-cache";
import {
  ThreeAnimatorWorldCoordinator,
} from "../character/adapters/three/three-animator-world-coordinator";
import { createAnimatorIkGoalStore } from "../character/application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../character/application/playback/animator-root-motion-port";
import { characterRuntimeSuccess } from "../character/runtime/diagnostics";

const CONTROLLER_GUID = "a".repeat(32);
const MODEL_GUID = "b".repeat(32);
const CLIP_ID = `${MODEL_GUID}:clip:soak`;
const FIXED_STEP_SECONDS = 1 / 60;

function component(overrides: Partial<AnimatorComponent> = {}): AnimatorComponent {
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
    updateMode: "fixedStep",
    cullingMode: "alwaysAnimate",
    parameterOverrides: [],
    ...overrides,
  };
}

function controller(eventCount = 0): AnimatorController {
  return {
    version: 1,
    id: CONTROLLER_GUID,
    name: "Soak Controller",
    revision: "soak-r1",
    parameters: [],
    layers: [{
      id: "base",
      name: "Base",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "loop",
      anyStateTransitions: [],
      states: [{
        id: "loop",
        name: "Loop",
        motion: {
          kind: "clip",
          clipRef: { guid: MODEL_GUID, localId: "clip:soak" },
          speed: 1,
        },
        speed: 1,
        cycleOffset: 0,
        mirror: false,
        footIk: false,
        writeDefaults: true,
        transitions: [],
        events: Array.from({ length: eventCount }, (_, index) => ({
          id: `state-event-${index}`,
          name: `State Event ${index}`,
          timeNormalized: (index + 1) / (eventCount + 1),
          payload: { index },
        })),
      }],
    }],
  };
}

function stringAssets(eventCount = 0, durationSeconds = 10_000): AnimatorPlaybackAssets<string> {
  return {
    controller: controller(eventCount),
    clips: [{
      id: CLIP_ID,
      resource: "soak-clip",
      metadata: {
        durationSeconds,
        looping: true,
        events: Array.from({ length: eventCount }, (_, index) => ({
          id: `clip-event-${index}`,
          name: `Clip Event ${index}`,
          timeSeconds: durationSeconds * (index + 1) / (eventCount + 1),
          payload: { index },
        })),
      },
    }],
    masks: [],
  };
}

function countingPose<TClip>() {
  let applications = 0;
  let latestTime = 0;
  const pose: AnimatorPoseApplier<TClip> = {
    isVisible: () => true,
    applyPose: ({ plan }) => {
      applications += 1;
      latestTime = plan.instructions[0]?.clips[0]?.unwrappedLocalTimeSeconds ?? latestTime;
      return characterRuntimeSuccess({ changed: true });
    },
    restoreAuthoredPose: vi.fn(),
    dispose: vi.fn(),
  };
  return {
    pose,
    applications: () => applications,
    latestTime: () => latestTime,
  };
}

describe("Animator playback deterministic soak", () => {
  it("keeps fixed-step results cadence-independent through 30,000 simulation steps", () => {
    const highCadencePose = countingPose<string>();
    const lowCadencePose = countingPose<string>();
    const highCadence = createAnimatorPlaybackSession({
      characterId: "high-cadence",
      component: component(),
      assets: stringAssets(),
      pose: highCadencePose.pose,
      fixedStepSeconds: FIXED_STEP_SECONDS,
    }).value!;
    const lowCadence = createAnimatorPlaybackSession({
      characterId: "low-cadence",
      component: component(),
      assets: stringAssets(),
      pose: lowCadencePose.pose,
      fixedStepSeconds: FIXED_STEP_SECONDS,
    }).value!;
    const highInitialApplications = highCadencePose.applications();
    const lowInitialApplications = lowCadencePose.applications();

    for (let frame = 0; frame < 60_000; frame += 1) {
      highCadence.advance({ deltaSeconds: 1 / 120 });
    }
    for (let frame = 0; frame < 15_000; frame += 1) {
      lowCadence.advance({ deltaSeconds: 1 / 30 });
    }

    expect(highCadencePose.applications() - highInitialApplications).toBe(30_000);
    // Pose submission is intentionally coalesced to the final fixed-step plan
    // for each display frame, so the 30 Hz path submits half as often.
    expect(lowCadencePose.applications() - lowInitialApplications).toBe(15_000);
    expect(highCadencePose.latestTime()).toBeCloseTo(500, 6);
    expect(lowCadencePose.latestTime()).toBeCloseTo(500, 6);
    expect(highCadencePose.latestTime()).toBeCloseTo(lowCadencePose.latestTime(), 9);

    highCadence.dispose();
    highCadence.dispose();
    lowCadence.dispose();
    lowCadence.dispose();
    expect(highCadencePose.pose.restoreAuthoredPose).toHaveBeenCalledOnce();
    expect(highCadencePose.pose.dispose).toHaveBeenCalledOnce();
    expect(lowCadencePose.pose.restoreAuthoredPose).toHaveBeenCalledOnce();
    expect(lowCadencePose.pose.dispose).toHaveBeenCalledOnce();
  });

  it("bounds combined authored-state and clip event delivery every frame", () => {
    const delivered = vi.fn();
    const maxEventsPerFrame = 7;
    const session = createAnimatorPlaybackSession({
      characterId: "event-heavy",
      component: component({ updateMode: "normal" }),
      assets: stringAssets(64, 1),
      pose: countingPose<string>().pose,
      maxEventsPerFrame,
      onEvent: delivered,
    }).value!;
    let returnedEvents = 0;
    let truncatedFrames = 0;

    for (let frame = 0; frame < 2_000; frame += 1) {
      const step = session.advance({ deltaSeconds: 0.25 });
      expect(step.events.length).toBeLessThanOrEqual(maxEventsPerFrame);
      returnedEvents += step.events.length;
      if (step.diagnostics.some((item) => item.code === "animation-events-truncated")) {
        truncatedFrames += 1;
      }
    }

    expect(returnedEvents).toBe(2_000 * maxEventsPerFrame);
    expect(delivered).toHaveBeenCalledTimes(returnedEvents);
    expect(truncatedFrames).toBe(2_000);
    session.dispose();
  });

  it("caps and releases Three actions without private unbounded growth", () => {
    const body = new THREE.Group();
    const animated = new THREE.Object3D();
    animated.name = "Animated";
    body.add(animated);
    const source = new THREE.AnimationClip("Move", 1, [
      new THREE.VectorKeyframeTrack("Animated.position", [0, 1], [0, 0, 0, 1, 0, 0]),
    ]);
    const clipsById = new Map();
    const samples = Array.from({ length: 129 }, (_, index) => {
      const id = `model:clip:${index}`;
      clipsById.set(id, {
        id,
        resource: { bindings: [{ root: body, clip: source }] },
        metadata: { durationSeconds: 1, looping: true, events: [] },
      });
      return {
        sampleId: `sample-${index}`,
        clipId: id,
        localTimeSeconds: 0.5,
        unwrappedLocalTimeSeconds: 0.5,
        weight: 1 / 129,
      };
    });
    const application: AnimatorPoseApplication<ThreeAnimatorClipResource> = {
      plan: {
        controllerId: CONTROLLER_GUID,
        controllerRevision: "soak-r1",
        instructions: [{
          layerId: "base",
          blendMode: "override",
          layerWeight: 1,
          gpuMaskIndex: null,
          clips: samples,
        }],
      },
      clipsById,
      masksById: new Map(),
    };
    const stopAllAction = vi.spyOn(THREE.AnimationMixer.prototype, "stopAllAction");
    const uncacheAction = vi.spyOn(THREE.AnimationMixer.prototype, "uncacheAction");
    const uncacheRoot = vi.spyOn(THREE.AnimationMixer.prototype, "uncacheRoot");
    const cache = new ThreeAnimatorActionCache(body);

    const result = cache.apply(application);
    expect(result.value).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toContain("three-animator-action-capacity");
    expect(stopAllAction).not.toHaveBeenCalled();
    expect(uncacheAction.mock.calls.length).toBeGreaterThanOrEqual(128);
    expect(uncacheRoot).toHaveBeenCalledOnce();

    const recoveryApplication: AnimatorPoseApplication<ThreeAnimatorClipResource> = {
      ...application,
      plan: {
        ...application.plan,
        instructions: [{ ...application.plan.instructions[0]!, clips: [samples[0]!] }],
      },
    };
    expect(cache.apply(recoveryApplication).value).not.toBeNull();
    const beforeDispose = {
      stop: stopAllAction.mock.calls.length,
      actions: uncacheAction.mock.calls.length,
      roots: uncacheRoot.mock.calls.length,
    };
    cache.dispose();
    const cleanupCounts = {
      stop: stopAllAction.mock.calls.length,
      actions: uncacheAction.mock.calls.length,
      roots: uncacheRoot.mock.calls.length,
    };
    expect(cleanupCounts).toEqual({
      stop: beforeDispose.stop + 1,
      actions: beforeDispose.actions + 1,
      roots: beforeDispose.roots + 1,
    });
    cache.dispose();
    expect({
      stop: stopAllAction.mock.calls.length,
      actions: uncacheAction.mock.calls.length,
      roots: uncacheRoot.mock.calls.length,
    }).toEqual(cleanupCounts);
    expect(cache.apply(application).diagnostics[0]?.code).toBe("disposed-three-animator");
    vi.restoreAllMocks();
  });

  it("cycles through the full 256-clip controller budget with an active-plan working set", () => {
    const body = new THREE.Group();
    const targets = Array.from({ length: 20 }, (_, index) => {
      const target = new THREE.Object3D();
      target.name = `Animated${index}`;
      body.add(target);
      return target;
    });
    const clipsById = new Map<string, AnimatorPlaybackClip<ThreeAnimatorClipResource>>(
      Array.from({ length: 256 }, (_, clipIndex) => {
        const id = `model:clip:${clipIndex}`;
        const clip = new THREE.AnimationClip(`Clip ${clipIndex}`, 1, targets.map((target, trackIndex) => (
          new THREE.VectorKeyframeTrack(
            `${target.name}.position`,
            [0, 1],
            [0, 0, 0, clipIndex + trackIndex + 1, 0, 0],
          )
        )));
        return [id, {
          id,
          resource: { bindings: [{ root: body, clip }] },
          metadata: { durationSeconds: 1, looping: true, events: [] },
        }] as const;
      }),
    );
    const uncacheAction = vi.spyOn(THREE.AnimationMixer.prototype, "uncacheAction");
    const cache = new ThreeAnimatorActionCache(body);

    for (let index = 0; index < clipsById.size; index += 1) {
      const id = `model:clip:${index}`;
      const result = cache.apply({
        plan: {
          controllerId: CONTROLLER_GUID,
          controllerRevision: "soak-r1",
          instructions: [{
            layerId: "base",
            blendMode: "override",
            layerWeight: 1,
            gpuMaskIndex: null,
            clips: [{
              sampleId: id,
              clipId: id,
              localTimeSeconds: 0.5,
              unwrappedLocalTimeSeconds: 0.5,
              weight: 1,
            }],
          }],
        },
        clipsById,
        masksById: new Map(),
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.value?.changed).toBe(true);
    }

    expect(uncacheAction.mock.calls.length).toBeGreaterThanOrEqual(255);
    cache.dispose();
    uncacheAction.mockRestore();
  });

  it("caps world sessions and restores every attached pose exactly once", async () => {
    const requestedCount = 48;
    const objects = Array.from({ length: requestedCount }, (_, index) => sceneObject(index));
    const { bodies } = runtimeWithBodies(objects);
    const poses: AnimatorPoseApplier<ThreeAnimatorClipResource>[] = [];
    const resolver = {
      load: vi.fn(async (object: SceneObject) => { const body = new THREE.Group(), node = new THREE.Group(); node.add(body); return characterRuntimeSuccess({ node, body, assets: threeAssets(body, object.id), dispose: vi.fn() }); }),
      dispose: vi.fn(),
    };
    const coordinator = new ThreeAnimatorWorldCoordinator({
      fixedStepSeconds: 1 / 60,
      ikStore: createAnimatorIkGoalStore(), rootMotionStore: createAnimatorRootMotionStore(),
      onEvent: vi.fn(), onChange: vi.fn(), onDiagnostics: vi.fn(), wake: vi.fn(), physicsMotorFor: () => undefined,
      objects,
      catalog: {
        library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} },
        importedAssets: [],
      },
      assets: resolver,
      createPoseBackend: vi.fn(() => {
        const pose: AnimatorPoseApplier<ThreeAnimatorClipResource> = {
          isVisible: () => true,
          applyPose: () => characterRuntimeSuccess({ changed: true }),
          restoreAuthoredPose: vi.fn(),
          dispose: vi.fn(),
        };
        poses.push(pose);
        return characterRuntimeSuccess({ pose, rootMotionSink: { applyRootMotion: vi.fn() } });
      }),
    });

    await vi.waitFor(() => expect(coordinator.liveSessionCount()).toBe(32));
    expect(resolver.load).toHaveBeenCalledTimes(32);
    expect(bodies).toHaveLength(requestedCount);
    expect(coordinator.diagnostics().map((item) => item.code))
      .toContain("animator-world-session-capacity");
    coordinator.dispose();
    coordinator.dispose();
    expect(resolver.dispose).toHaveBeenCalledOnce();
    expect(poses).toHaveLength(32);
    for (const pose of poses) {
      expect(pose.restoreAuthoredPose).toHaveBeenCalledOnce();
      expect(pose.dispose).toHaveBeenCalledOnce();
    }
  });
});

function sceneObject(index: number): SceneObject {
  return {
    id: `character-${index}`,
    name: `Character ${index}`,
    primitive: "gltf",
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetRef: { guid: MODEL_GUID, localId: "main" },
    animator: component(),
  };
}

function runtimeWithBodies(objects: readonly SceneObject[]): {
  runtime: Runtime;
  bodies: THREE.Group[];
} {
  const bodies: THREE.Group[] = [];
  const objectMap = new Map<string, THREE.Group>();
  for (const object of objects) {
    const node = new THREE.Group();
    const body = new THREE.Group();
    node.userData.sceneObjectNode = true;
    node.userData.objectId = object.id;
    node.userData.bodyKind = "asset";
    node.add(body);
    bodies.push(body);
    objectMap.set(object.id, node);
  }
  return {
    bodies,
    runtime: {
      disposed: false,
      objectMap,
      framesSinceSceneChange: 3,
      requestFrame: vi.fn(),
    } as unknown as Runtime,
  };
}

function threeAssets(
  root: THREE.Object3D,
  characterId: string,
): AnimatorPlaybackAssets<ThreeAnimatorClipResource> {
  return {
    controller: controller(),
    clips: [{
      id: CLIP_ID,
      resource: { bindings: [{ root, clip: new THREE.AnimationClip(`Idle ${characterId}`, 1, []) }] },
      metadata: { durationSeconds: 1, looping: true, events: [] },
    }],
    masks: [],
  };
}
