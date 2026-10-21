import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { describe, expect, it, vi } from "vitest";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import { emitRuntimeBodyLifecycle } from "../../../three/reconciliation/body-lifecycle";
import { createAnimatorIkGoalStore } from "../../application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../../application/playback/animator-root-motion-port";
import type { AnimatorPlaybackAssets, AnimatorPoseApplier } from "../../application/playback/animator-playback-contracts";
import { characterRuntimeFailure, characterRuntimeSuccess } from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import { ThreeAnimatorWorldCoordinator } from "./three-animator-world-coordinator";
import type { ThreeAnimatorWorldAssets, ThreeAnimatorWorldRig } from "./three-animator-world-assets";

const CONTROLLER_GUID = "a".repeat(32);
const MODEL_GUID = "b".repeat(32);
const CLIP_ID = `${MODEL_GUID}:clip:idle`;

function sceneObject(overrides: Partial<SceneObject> = {}): SceneObject {
  return {
    id: "hero",
    name: "Hero",
    primitive: "gltf",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    assetRef: { guid: MODEL_GUID, localId: "main" },
    animator: {
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
    },
    ...overrides,
  };
}

function assets(root: THREE.Object3D): AnimatorPlaybackAssets<ThreeAnimatorClipResource> {
  return {
    controller: {
      version: 1,
      id: CONTROLLER_GUID,
      name: "Controller",
      revision: "r1",
      parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }],
      layers: [{
        id: "base",
        name: "Base",
        weight: 1,
        blendingMode: "override",
        ikPass: false,
        defaultStateId: "idle",
        anyStateTransitions: [],
        states: [{
          id: "idle",
          name: "Idle",
          motion: { kind: "clip", clipRef: { guid: MODEL_GUID, localId: "clip:idle" }, speed: 1 },
          speed: 1,
          cycleOffset: 0,
          mirror: false,
          footIk: false,
          writeDefaults: true,
          transitions: [],
          events: [],
        }],
      }],
    },
    clips: [{
      id: CLIP_ID,
      resource: { bindings: [{ root, clip: new THREE.AnimationClip("Idle", 1, [new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 0, 0])]) }] },
      metadata: { durationSeconds: 1, looping: true, events: [{ id: "beat", name: "Beat", timeSeconds: 0.1, payload: {} }] },
    }],
    masks: [],
  };
}

function runtimeWithBody(body: THREE.Object3D): { runtime: Runtime; node: THREE.Group } {
  const node = new THREE.Group();
  node.userData.sceneObjectNode = true;
  node.userData.objectId = "hero";
  node.userData.bodyKind = "asset";
  node.add(body);
  const requestFrame = vi.fn();
  const runtime = {
    disposed: false,
    objectMap: new Map([["hero", node]]),
    assetCache: { acquire: vi.fn(), dispose: vi.fn() },
    framesSinceSceneChange: 3,
    requestFrame,
  } as unknown as Runtime;
  return { runtime, node };
}

function poseFactory() {
  const poses: Array<AnimatorPoseApplier<ThreeAnimatorClipResource>> = [];
  const factory = vi.fn(() => {
    const pose: AnimatorPoseApplier<ThreeAnimatorClipResource> = {
      isVisible: () => true,
      applyPose: vi.fn(() => characterRuntimeSuccess({ changed: true })),
      readRootMotionPose: () => characterRuntimeSuccess({
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      }),
      removeRootMotionFromPose: () => characterRuntimeSuccess(undefined),
      restoreAuthoredPose: vi.fn(),
      dispose: vi.fn(),
    };
    poses.push(pose);
    return characterRuntimeSuccess({
      pose,
      rootMotionSink: { applyRootMotion: vi.fn() },
    });
  });
  return { factory, poses };
}

const EMPTY_CATALOG = {
  library: { version: 1 as const, animatorControllers: [], avatarMasks: [], extensions: {} },
  importedAssets: [],
};


function rig(): ThreeAnimatorWorldRig {
  const body = new THREE.Group(), node = new THREE.Group(); node.add(body);
  return { node, body, assets: assets(body), dispose: vi.fn() };
}
function world(options: Partial<ConstructorParameters<typeof ThreeAnimatorWorldCoordinator>[0]> = {}) {
  const owned = rig();
  const store: ThreeAnimatorWorldAssets = { load: vi.fn(async () => characterRuntimeSuccess(owned)), dispose: vi.fn() };
  const event = vi.fn(), change = vi.fn(), diagnostic = vi.fn();
  const coordinator = new ThreeAnimatorWorldCoordinator({
    objects: [sceneObject()], catalog: EMPTY_CATALOG, fixedStepSeconds: 1 / 60,
    ikStore: createAnimatorIkGoalStore(), rootMotionStore: createAnimatorRootMotionStore(),
    onEvent: event, onChange: change, onDiagnostics: diagnostic, wake: vi.fn(), physicsMotorFor: () => undefined,
    assets: store, ...options,
  });
  return { coordinator, owned, store, event, change };
}

describe("world-owned Animator", () => {
  it("evaluates one controller and event stream while two views receive the same pose", async () => {
    const { coordinator, store, event } = world();
    const one = runtimeWithBody(new THREE.Group()), two = runtimeWithBody(new THREE.Group());
    const detachOne = coordinator.attachView(one.runtime), detachTwo = coordinator.attachView(two.runtime);
    await vi.waitFor(() => expect(coordinator.liveSessionCount(), JSON.stringify(coordinator.diagnostics())).toBe(1));
    coordinator.advance({ deltaSeconds: 0.15 });
    expect(store.load).toHaveBeenCalledOnce();
    expect(event).toHaveBeenCalledOnce();
    expect(one.node.children[0]!.position.x).toBeCloseTo(0.15);
    expect(two.node.children[0]!.position.x).toBeCloseTo(0.15);
    expect(coordinator.commands.setFloat("hero", "speed", 3).value).toBeUndefined();
    expect(coordinator.runtimeState("hero")!.parameters.speed).toBe(3);
    const state = coordinator.runtimeState("hero");
    detachOne(); detachTwo();
    const next = runtimeWithBody(new THREE.Group());
    const detachNext = coordinator.attachView(next.runtime);
    expect(coordinator.runtimeState("hero")).toBe(state);
    expect(next.node.children[0]!.position.x).toBeCloseTo(0.15);
    expect(event).toHaveBeenCalledOnce();
    coordinator.advance({ deltaSeconds: 0.05 });
    expect(next.node.children[0]!.position.x).toBeCloseTo(0.2);
    detachNext(); coordinator.dispose();
    expect(next.node.children[0]!.position.x).toBe(0);
  });

  it("replacing a view body preserves controller time and parameters", async () => {
    const { coordinator } = world(); const { runtime, node } = runtimeWithBody(new THREE.Group());
    coordinator.attachView(runtime);
    await vi.waitFor(() => expect(coordinator.liveSessionCount(), JSON.stringify(coordinator.diagnostics())).toBe(1));
    coordinator.advance({ deltaSeconds: 0.2 });
    const state = coordinator.runtimeState("hero"), previousBody = node.children[0]!, nextBody = new THREE.Group();
    emitRuntimeBodyLifecycle(runtime, { phase: "willChange", objectId: "hero", node, previousBody, nextBody, nextKind: "asset" });
    node.remove(previousBody); node.add(nextBody);
    emitRuntimeBodyLifecycle(runtime, { phase: "didChange", objectId: "hero", node, previousBody, nextBody, nextKind: "asset" });
    expect(coordinator.runtimeState("hero")).toBe(state);
    expect(previousBody.position.x).toBe(0); expect(nextBody.position.x).toBeCloseTo(0.2);
    coordinator.dispose();
  });

  it.each(["stop", "destroy"])("rejects deferred rig loads after %s", async (operation) => {
    let complete!: (value: ReturnType<typeof characterRuntimeSuccess<ThreeAnimatorWorldRig>>) => void;
    const owned = rig();
    const { coordinator } = world({ assets: { load: () => new Promise((resolve) => { complete = resolve; }), dispose: vi.fn() } });
    if (operation === "stop") coordinator.dispose(); else coordinator.remove("hero");
    complete(characterRuntimeSuccess(owned));
    await vi.waitFor(() => expect(owned.dispose).toHaveBeenCalledOnce());
    expect(coordinator.liveSessionCount()).toBe(0); coordinator.dispose();
  });

  it("restores all targets and releases each session once on destruction", async () => {
    const { coordinator, owned, store, event } = world();
    const { runtime, node } = runtimeWithBody(new THREE.Group()); coordinator.attachView(runtime);
    await vi.waitFor(() => expect(coordinator.liveSessionCount(), JSON.stringify(coordinator.diagnostics())).toBe(1));
    coordinator.advance({ deltaSeconds: 0.15 }); coordinator.remove("hero");
    coordinator.advance({ deltaSeconds: 0.15 });
    expect(coordinator.runtimeState("hero")).toBeNull(); expect(owned.dispose).toHaveBeenCalledOnce();
    expect(node.children[0]!.position.x).toBe(0); expect(event).toHaveBeenCalledOnce();
    expect(coordinator.commands.setFloat("hero", "Speed", 1).value).toBeNull();
    coordinator.dispose(); coordinator.dispose(); expect(store.dispose).toHaveBeenCalledOnce();
  });

  it.each(["diagnostic", "throw"])("contains pose initialization %s and releases resources", async (kind) => {
    const backend = poseFactory();
    const factory = () => { const result = backend.factory(); result.value!.pose.applyPose = () => {
      if (kind === "throw") throw new Error("fixture failed");
      return characterRuntimeFailure("fixture-failed", "Fixture failed");
    }; return result; };
    const { coordinator, owned } = world({ createPoseBackend: factory });
    await vi.waitFor(() => expect(owned.dispose).toHaveBeenCalledOnce());
    expect(backend.poses[0]!.restoreAuthoredPose).toHaveBeenCalledOnce();
    expect(backend.poses[0]!.dispose).toHaveBeenCalledOnce();
    expect(coordinator.liveSessionCount()).toBe(0); coordinator.dispose();
  });

  it.each(["diagnostic", "throw"])("contains live pose %s and releases the failed session", async (kind) => {
    const backend = poseFactory();
    const { coordinator, owned } = world({ createPoseBackend: backend.factory });
    await vi.waitFor(() => expect(coordinator.liveSessionCount()).toBe(1));
    vi.spyOn(backend.poses[0]!, "applyPose").mockImplementation(() => {
      if (kind === "throw") throw new Error("live pose failed");
      return characterRuntimeFailure("live-pose-failed", "Live pose failed");
    });
    coordinator.advance({ deltaSeconds: 0.1 });
    expect(coordinator.liveSessionCount()).toBe(0);
    expect(owned.dispose).toHaveBeenCalledOnce();
    expect(backend.poses[0]!.dispose).toHaveBeenCalledOnce();
    coordinator.dispose();
  });

  it("finishes releasing resources when pose restoration or rig cleanup throws", async () => {
    const backend = poseFactory();
    const { coordinator, owned, store } = world({ createPoseBackend: backend.factory });
    await vi.waitFor(() => expect(coordinator.liveSessionCount()).toBe(1));
    vi.mocked(backend.poses[0]!.restoreAuthoredPose).mockImplementation(() => { throw new Error("restore failed"); });
    vi.mocked(owned.dispose).mockImplementation(() => { throw new Error("rig cleanup failed"); });
    expect(() => coordinator.dispose()).not.toThrow();
    expect(backend.poses[0]!.dispose).toHaveBeenCalledOnce();
    expect(owned.dispose).toHaveBeenCalledOnce(); expect(store.dispose).toHaveBeenCalledOnce();
    expect(coordinator.liveSessionCount()).toBe(0);
  });

  it("caps model loading to 32 world sessions, regardless of views", async () => {
    const load = vi.fn(async () => characterRuntimeSuccess(rig()));
    const { coordinator } = world({ objects: Array.from({ length: 40 }, (_, id) => sceneObject({ id: String(id) })), assets: { load, dispose: vi.fn() } });
    await vi.waitFor(() => expect(coordinator.liveSessionCount()).toBe(32));
    expect(load).toHaveBeenCalledTimes(32);
    expect(coordinator.diagnostics().map((item) => item.code)).toContain("animator-world-session-capacity");
    coordinator.dispose();
  });
  it("applies and observes root motion once while late views inherit accumulated displacement", async () => {
    const owned = rig(), bone = new THREE.Bone(); bone.name = "Root"; owned.body.add(bone);
    const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const count = skin.geometry.getAttribute("position").count;
    skin.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
    skin.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    skin.bind(new THREE.Skeleton([bone])); owned.body.add(skin);
    const clip = owned.assets.clips[0]!.resource.bindings[0]!.clip;
    clip.tracks = [new THREE.VectorKeyframeTrack("Root.position", [0, 1], [0, 0, 0, 1, 0, 0])];
    const object = sceneObject(); object.animator = { ...object.animator!, rootMotion: { ...object.animator!.rootMotion, mode: "applyToObject", source: "rootBone" } };
    const motion = createAnimatorRootMotionStore(), observed = vi.fn(); motion.port.subscribe(observed);
    const { coordinator } = world({ objects: [object], rootMotionStore: motion, assets: { load: async () => characterRuntimeSuccess(owned), dispose: vi.fn() } });
    const a = runtimeWithBody(cloneSkeleton(owned.body)), b = runtimeWithBody(cloneSkeleton(owned.body));
    const detachA = coordinator.attachView(a.runtime), detachB = coordinator.attachView(b.runtime);
    await vi.waitFor(() => expect(coordinator.liveSessionCount(), JSON.stringify(coordinator.diagnostics())).toBe(1));
    coordinator.advance({ deltaSeconds: 0.2 });
    expect(observed).toHaveBeenCalledOnce();
    expect(owned.node.position.x).toBeCloseTo(0.2);
    expect(a.node.position.x).toBeCloseTo(0.2); expect(b.node.position.x).toBeCloseTo(0.2);
    expect(a.node.children[0]!.children[0]!.position.x).toBe(0);
    detachA(); detachB();
    const c = runtimeWithBody(cloneSkeleton(owned.body)); coordinator.attachView(c.runtime);
    expect(c.node.position.x).toBeCloseTo(0.2); expect(observed).toHaveBeenCalledOnce();
    coordinator.advance({ deltaSeconds: 0.1 }); expect(c.node.position.x).toBeCloseTo(0.3);
    expect(observed).toHaveBeenCalledTimes(2); coordinator.dispose(); expect(c.node.position.x).toBe(0);
  });

  it("one registered motor owns physics root motion and destruction releases its registration", async () => {
    const backend = poseFactory(), motion = createAnimatorRootMotionStore(), motor = vi.fn();
    motion.port.registerMotor("hero", { applyRootMotion: motor });
    const object = sceneObject(); object.animator = { ...object.animator!, rootMotion: { ...object.animator!.rootMotion, mode: "applyToObject" } };
    const { coordinator } = world({ objects: [object], rootMotionStore: motion, createPoseBackend: backend.factory });
    await vi.waitFor(() => expect(coordinator.liveSessionCount(), JSON.stringify(coordinator.diagnostics())).toBe(1));
    coordinator.advance({ deltaSeconds: 0.1 }); expect(motor).toHaveBeenCalledOnce();
    coordinator.remove("hero"); expect(motion.hasMotor("hero")).toBe(false);
    coordinator.advance({ deltaSeconds: 0.1 }); expect(motor).toHaveBeenCalledOnce(); coordinator.dispose();
  });

});
