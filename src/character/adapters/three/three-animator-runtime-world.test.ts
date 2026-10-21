import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { afterEach, expect, it, vi } from "vitest";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import type { EntityHandle } from "../../../world/domain/entity-world";
import { createAnimatorIkGoalStore } from "../../application/playback/animator-playback-ik";
import { createAnimatorRootMotionStore } from "../../application/playback/animator-root-motion-port";
import { animatorPreviewParameters } from "../../application/playback/animator-preview-parameter-store";
import { characterRuntimeSuccess } from "../../runtime/diagnostics";
import { ThreeAnimatorWorldCoordinator } from "./three-animator-world-coordinator";
import type { ThreeAnimatorWorldRig } from "./three-animator-world-assets";
import { defaultRigidbodyForObject } from "../../../physics/authoring/component-defaults";

const guid = "a".repeat(32), model = "b".repeat(32);
function object(id: string): SceneObject {
  return { id, name: id, primitive: "gltf", color: "#fff", visible: true, locked: false,
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], assetRef: { guid: model, localId: "main" },
    animator: { version: 1, enabled: true, controllerRef: { guid, localId: "main" }, updateMode: "normal", cullingMode: "alwaysAnimate", parameterOverrides: [],
      rootMotion: { mode: "disabled", source: "clip", translationAxes: { x: true, y: true, z: true }, rotation: "yaw", bakeIntoPose: false } } };
}
function rig(): ThreeAnimatorWorldRig {
  const body = new THREE.Group(), node = new THREE.Group(); node.add(body);
  return { body, node, dispose: vi.fn(), assets: {
    controller: { version: 1, id: guid, name: "Test", revision: "r1", parameters: [{ id: "speed", name: "Speed", kind: "float", defaultValue: 0 }], layers: [{
      id: "base", name: "Base", weight: 1, blendingMode: "override", ikPass: false, defaultStateId: "idle", anyStateTransitions: [], states: [{
        id: "idle", name: "Idle", speed: 1, cycleOffset: 0, mirror: false, footIk: false, writeDefaults: true, transitions: [], events: [],
        motion: { kind: "clip", clipRef: { guid: model, localId: "clip:idle" }, speed: 1 },
      }],
    }] }, masks: [], clips: [{ id: `${model}:clip:idle`,
      resource: { bindings: [{ root: body, clip: new THREE.AnimationClip("Idle", 1, [new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 0, 0])]) }] },
      metadata: { durationSeconds: 1, looping: true, events: [{ id: "beat", name: "Beat", timeSeconds: 0.1, payload: {} }] },
    }],
  } };
}
function setup(objects: readonly SceneObject[] = [], load = vi.fn(async () => characterRuntimeSuccess(rig()))) {
  const event = vi.fn(), coordinator = new ThreeAnimatorWorldCoordinator({ objects, catalog: { importedAssets: [], library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} } },
    fixedStepSeconds: 1 / 60, ikStore: createAnimatorIkGoalStore(), rootMotionStore: createAnimatorRootMotionStore(),
    onEvent: event, onChange: vi.fn(), onDiagnostics: vi.fn(), wake: vi.fn(), physicsMotorFor: () => undefined,
    assets: { load, dispose: vi.fn() },
  });
  return { coordinator, event };
}
function view(body = new THREE.Group()) {
  const node = new THREE.Group(); node.add(body);
  const runtime = { disposed: false, objectMap: new Map(), requestFrame: vi.fn(), framesSinceSceneChange: 0 } as unknown as Runtime;
  return { node, body, runtime };
}
afterEach(() => animatorPreviewParameters.clear());

it("prepares runtime controllers before publication and sends one event stream to explicit clockless views", () => {
  const { coordinator, event } = setup(), owned = rig(), entity = { world: Symbol(), slot: 2, generation: 3 };
  const change = coordinator.prepareRuntimeChange([{ object: object("runtime:a"), rig: owned, entity }], []);
  const a = view(), b = view();
  const detachA = coordinator.attachRuntimeView("runtime:a", a.runtime, a.node, a.body);
  const detachB = coordinator.attachRuntimeView("runtime:a", b.runtime, b.node, b.body);
  expect(coordinator.liveSessionCount()).toBe(0); expect(coordinator.reservedSessionCount()).toBe(1);
  expect(coordinator.runtimeAnimatorId(entity)).toBeUndefined();
  coordinator.advance({ deltaSeconds: 0.2 }); expect(event).not.toHaveBeenCalled();
  change.publish(); change.retire();
  expect(coordinator.runtimeAnimatorId(entity)).toBe("runtime:a"); expect(coordinator.runtimeEntity("runtime:a")).toEqual(entity);
  expect(coordinator.runtimeAnimatorId({ ...entity, generation: 4 })).toBeUndefined();
  expect(coordinator.runtimeAnimatorId({ ...entity, world: Symbol() })).toBeUndefined();
  coordinator.advance({ deltaSeconds: 0.15 }); expect(event).toHaveBeenCalledOnce();
  expect(a.body.position.x).toBeCloseTo(0.15); expect(b.body.position.x).toBeCloseTo(0.15);
  detachA(); detachB();
  const late = view(); coordinator.attachRuntimeView("runtime:a", late.runtime, late.node, late.body);
  expect(late.body.position.x).toBeCloseTo(0.15); expect(event).toHaveBeenCalledOnce();
  coordinator.dispose(); expect(owned.dispose).toHaveBeenCalledOnce(); expect(coordinator.runtimeEntity("runtime:a")).toBeUndefined();
});

it("suspends removal without losing controller state and restores it atomically on rollback", () => {
  const { coordinator, event } = setup(), owned = rig(), entity: EntityHandle = { world: Symbol(), slot: 0, generation: 1 }, target = view();
  const creation = coordinator.prepareRuntimeChange([{ object: object("runtime:a"), rig: owned, entity }], []); creation.publish(); creation.retire();
  coordinator.attachRuntimeView("runtime:a", target.runtime, target.node, target.body);
  coordinator.advance({ deltaSeconds: 0.15 }); coordinator.commands.setFloat("runtime:a", "speed", 7);
  const state = coordinator.runtimeState("runtime:a");
  const removal = coordinator.prepareRuntimeChange([], ["runtime:a"]); removal.publish();
  expect(coordinator.runtimeState("runtime:a")).toBeNull(); expect(coordinator.runtimeAnimatorId(entity)).toBeUndefined();
  expect(owned.dispose).not.toHaveBeenCalled(); expect(target.body.position.x).toBe(0);
  coordinator.advance({ deltaSeconds: 0.5 }); expect(event).toHaveBeenCalledOnce();
  removal.rollback(); expect(coordinator.runtimeState("runtime:a")).toBe(state); expect(coordinator.runtimeAnimatorId(entity)).toBe("runtime:a");
  expect(target.body.position.x).toBeCloseTo(0.15);
  const committed = coordinator.prepareRuntimeChange([], ["runtime:a"]); committed.publish(); committed.retire();
  expect(owned.dispose).toHaveBeenCalledOnce(); coordinator.dispose(); expect(owned.dispose).toHaveBeenCalledOnce();
});

it("rolls back partial publication when an explicit view is incompatible", () => {
  const { coordinator } = setup(), owned = rig(), a = view(), b = view(); b.body.name = "different";
  coordinator.attachRuntimeView("runtime:a", a.runtime, a.node, a.body); coordinator.attachRuntimeView("runtime:a", b.runtime, b.node, b.body);
  const change = coordinator.prepareRuntimeChange([{ object: object("runtime:a"), rig: owned }], []);
  expect(() => change.publish()).toThrow(/differs/); change.rollback();
  expect(coordinator.liveSessionCount()).toBe(0); expect(coordinator.reservedSessionCount()).toBe(0); expect(owned.dispose).toHaveBeenCalledOnce();
  expect(a.body.position.x).toBe(0); coordinator.dispose();
});

it("counts pending authored loads, prepared sessions, and retiring sessions against one capacity", async () => {
  let complete!: (value: ReturnType<typeof characterRuntimeSuccess<ThreeAnimatorWorldRig>>) => void;
  const load = vi.fn(() => new Promise<ReturnType<typeof characterRuntimeSuccess<ThreeAnimatorWorldRig>>>((resolve) => { complete = resolve; }));
  const { coordinator } = setup(Array.from({ length: 31 }, (_, index) => object(`authored:${index}`)), load);
  const first = rig(), change = coordinator.prepareRuntimeChange([{ object: object("runtime:a"), rig: first }], []), rejected = rig();
  expect(() => coordinator.prepareRuntimeChange([{ object: object("runtime:b"), rig: rejected }], [])).toThrow(/capacity/);
  expect(rejected.dispose).toHaveBeenCalledOnce(); change.publish(); change.retire();
  const removal = coordinator.prepareRuntimeChange([], ["runtime:a"]); removal.publish(); const blocked = rig();
  expect(() => coordinator.prepareRuntimeChange([{ object: object("runtime:b"), rig: blocked }], [])).toThrow(/capacity/);
  removal.retire(); const next = rig(), reservation = coordinator.prepareRuntimeChange([{ object: object("runtime:b"), rig: next }], []);
  reservation.rollback(); expect(next.dispose).toHaveBeenCalledOnce();
  coordinator.dispose(); complete(characterRuntimeSuccess(rig())); await Promise.resolve();
});

it("starts pooled runtime controllers from authored defaults without editor preview parameters", () => {
  const { coordinator } = setup(), first = rig();
  animatorPreviewParameters.set(`runtime:a\u0000${guid}`, { speed: 99 });
  const create = coordinator.prepareRuntimeChange([{ object: object("runtime:a"), rig: first }], []); create.publish(); create.retire();
  expect(coordinator.runtimeState("runtime:a")!.parameters.speed).toBe(0);
  coordinator.commands.setFloat("runtime:a", "speed", 7); coordinator.advance({ deltaSeconds: 0.3 });
  const remove = coordinator.prepareRuntimeChange([], ["runtime:a"]); remove.publish(); remove.retire();
  const fresh = coordinator.prepareRuntimeChange([{ object: object("runtime:b"), rig: rig() }], []); fresh.publish(); fresh.retire();
  expect(coordinator.runtimeState("runtime:b")!.parameters.speed).toBe(0);
  expect(coordinator.runtimeState("runtime:b")!.layers[0]!.stateTimeSeconds).toBe(0); coordinator.dispose();
});

it("Stop releases prepared creations and suspended removals once, including late rollback calls", () => {
  const { coordinator } = setup(), active = rig(), pending = rig();
  const creation = coordinator.prepareRuntimeChange([{ object: object("runtime:a"), rig: active }], []); creation.publish(); creation.retire();
  const removal = coordinator.prepareRuntimeChange([], ["runtime:a"]); removal.publish();
  const preparation = coordinator.prepareRuntimeChange([{ object: object("runtime:b"), rig: pending }], []);
  coordinator.dispose(); removal.rollback(); preparation.rollback();
  expect(active.dispose).toHaveBeenCalledOnce(); expect(pending.dispose).toHaveBeenCalledOnce(); expect(coordinator.liveSessionCount()).toBe(0);
});

it("owns runtime root motion once while every clockless view inherits accumulated displacement", () => {
  const owned = rig(), bone = new THREE.Bone(); bone.name = "Root"; owned.body.add(bone);
  const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), count = skin.geometry.getAttribute("position").count;
  skin.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  skin.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4)); skin.bind(new THREE.Skeleton([bone])); owned.body.add(skin);
  owned.assets.clips[0]!.resource.bindings[0]!.clip.tracks = [new THREE.VectorKeyframeTrack("Root.position", [0, 1], [0, 0, 0, 1, 0, 0])];
  const motion = createAnimatorRootMotionStore(), observed = vi.fn(); motion.port.subscribe(observed);
  const coordinator = new ThreeAnimatorWorldCoordinator({ objects: [], catalog: { importedAssets: [], library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} } },
    fixedStepSeconds: 1 / 60, ikStore: createAnimatorIkGoalStore(), rootMotionStore: motion, onEvent: vi.fn(), onChange: vi.fn(), onDiagnostics: vi.fn(), wake: vi.fn(), physicsMotorFor: () => undefined,
    assets: { load: async () => characterRuntimeSuccess(rig()), dispose: vi.fn() },
  });
  const descriptor = object("runtime:motion"); descriptor.animator = { ...descriptor.animator!, rootMotion: { ...descriptor.animator!.rootMotion, mode: "applyToObject", source: "rootBone" } };
  const a = view(cloneSkeleton(owned.body) as THREE.Group), b = view(cloneSkeleton(owned.body) as THREE.Group);
  coordinator.attachRuntimeView(descriptor.id, a.runtime, a.node, a.body); coordinator.attachRuntimeView(descriptor.id, b.runtime, b.node, b.body);
  const change = coordinator.prepareRuntimeChange([{ object: descriptor, rig: owned }], []); change.publish(); change.retire();
  coordinator.advance({ deltaSeconds: 0.2 }); expect(observed).toHaveBeenCalledOnce();
  expect(a.node.position.x).toBeCloseTo(0.2); expect(b.node.position.x).toBeCloseTo(0.2);
  const late = view(cloneSkeleton(owned.body) as THREE.Group); coordinator.attachRuntimeView(descriptor.id, late.runtime, late.node, late.body);
  expect(late.node.position.x).toBeCloseTo(0.2); expect(observed).toHaveBeenCalledOnce();
  coordinator.dispose(); skin.geometry.dispose(); skin.material.dispose();
});

it("sends runtime kinematic root motion to its explicit entity motor instead of an Animator-ID lookup", () => {
  const owned = rig(), bone = new THREE.Bone(); bone.name = "Root"; owned.body.add(bone);
  const skin = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), count = skin.geometry.getAttribute("position").count;
  skin.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  skin.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4)); skin.bind(new THREE.Skeleton([bone])); owned.body.add(skin);
  owned.assets.clips[0]!.resource.bindings[0]!.clip.tracks = [new THREE.VectorKeyframeTrack("Root.position", [0, 1], [0, 0, 0, 1, 0, 0])];
  const rootMotionSink = { applyRootMotion: vi.fn() }, lookup = vi.fn(() => undefined);
  const coordinator = new ThreeAnimatorWorldCoordinator({ objects: [], catalog: { importedAssets: [], library: { version: 1, animatorControllers: [], avatarMasks: [], extensions: {} } },
    fixedStepSeconds: 1 / 60, ikStore: createAnimatorIkGoalStore(), rootMotionStore: createAnimatorRootMotionStore(), onEvent: vi.fn(), onChange: vi.fn(), onDiagnostics: vi.fn(), wake: vi.fn(), physicsMotorFor: lookup,
    assets: { load: async () => characterRuntimeSuccess(rig()), dispose: vi.fn() },
  });
  const descriptor = object("independent-animator-id");
  descriptor.rigidbody = { ...defaultRigidbodyForObject(descriptor), enabled: true, bodyType: "kinematic" };
  descriptor.animator = { ...descriptor.animator!, rootMotion: { ...descriptor.animator!.rootMotion, mode: "applyToObject", source: "rootBone" } };
  const entity: EntityHandle = { world: Symbol(), slot: 12, generation: 7 };
  const a = view(cloneSkeleton(owned.body) as THREE.Group), b = view(cloneSkeleton(owned.body) as THREE.Group);
  coordinator.attachRuntimeView(descriptor.id, a.runtime, a.node, a.body); coordinator.attachRuntimeView(descriptor.id, b.runtime, b.node, b.body);
  const change = coordinator.prepareRuntimeChange([{ object: descriptor, rig: owned, entity, rootMotionSink }], []);
  expect(rootMotionSink.applyRootMotion).not.toHaveBeenCalled(); change.publish(); change.retire();
  coordinator.advance({ deltaSeconds: 0.2 });
  expect(rootMotionSink.applyRootMotion).toHaveBeenCalledOnce(); expect(lookup).not.toHaveBeenCalled();
  expect(rootMotionSink.applyRootMotion.mock.calls[0][0]).toMatchObject({ characterId: descriptor.id,
    delta: { translation: [expect.closeTo(0.2, 6), 0, 0] } });
  expect(a.node.position.x).toBe(0); expect(b.node.position.x).toBe(0);
  const remove = coordinator.prepareRuntimeChange([], [descriptor.id]); remove.publish(); remove.retire();
  coordinator.advance({ deltaSeconds: 0.2 }); expect(rootMotionSink.applyRootMotion).toHaveBeenCalledOnce();
  coordinator.dispose(); skin.geometry.dispose(); skin.material.dispose();
});
