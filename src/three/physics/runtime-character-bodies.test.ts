import { expect, it, vi } from "vitest";
import { Scene, type Mesh, type InstancedBufferGeometry } from "three";
import { createRuntimeEntityBodies } from "./runtime-entity-bodies";
import { createPhysicsPlaybackCommands } from "./physics-playback-commands";
import { createPhysicsPlaybackMotorBuffer } from "./physics-playback-motor-buffer";
import { characterMotorState } from "./physics-character-commands";
import { PhysicsPoseBuffers } from "./gpu-pose";
import type { PhysicsPlaybackState } from "./physics-playback-state";
import type { PhysicsPlaybackSolver } from "./playback-backend";
import type { Runtime } from "../runtime";
import { createCharacterMotorWorld } from "../../character-controller/runtime/character-motor-world";
import { captureRuntimeCharacter } from "../../character-controller/domain/runtime-character";
import { createEntityWorld, type EntityLifecycleBackend } from "../../world/runtime/entity-world";
import type { EntityBatch, EntityCommand, EntityHandle } from "../../world/domain/entity-world";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { reserveRigidBodySlots } from "../../physics/runtime/rigid-body-slots";
import { createRigidSlotUpload } from "../../physics/gpu/rigid-slot-upload";
import { defaultColliderForObject } from "../../physics/authoring/component-defaults";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "../../physics/domain/world-settings";
import { createRigidBodyCommands } from "../../physics/gpu/rigid-body-commands";
import { makeObject } from "../../lib/payload";

const creation = (position: readonly [number, number, number] = [0, 0, 0]): EntityCommand => ({
  op: "create", key: "hero", name: "Runtime Hero", character: captureRuntimeCharacter({ position,
    capsule: { id: "saved-capsule", center: [0, 0.9, 0], radius: 0.35, halfLength: 0.55 },
    render: { shape: { kind: "box", size: [0.6, 1.8, 0.6] }, color: "#ffb020" } }),
});
const handle = (batch: EntityBatch): EntityHandle => {
  const result = batch.read(); if (result.status !== "committed") throw new Error(JSON.stringify(result));
  return result.created.hero;
};

function fixture(retire: () => Promise<void> = async () => undefined, failPublication = () => false) {
  const floor = makeObject("cube", 0, { id: "floor", position: [0, -0.5, 0] });
  floor.colliders = [{ ...defaultColliderForObject(floor), size: [40, 1, 40] }];
  const authored = [floor], source = structuredClone(authored);
  const compiled = compileRigidWorld(compileAuthoredPhysicsScene(authored, "runtime-character-test", settings));
  const descriptor = reserveRigidBodySlots(compiled, 1), writes = vi.fn(), reset = vi.fn();
  const upload = createRigidSlotUpload({ queue: { writeBuffer: writes } } as unknown as GPUDevice, descriptor,
    {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, [], { reset } as unknown as ReturnType<typeof createRigidBodyCommands>);
  const writeKinematicBodyPose = vi.fn(), motors = createPhysicsPlaybackMotorBuffer(vi.fn());
  const state = { runtime: { bodySlots: upload.port, writeKinematicBodyPose } as unknown as PhysicsPlaybackSolver,
    bodyBindings: descriptor.bodies.map((body) => body.binding), poseBuffers: new PhysicsPoseBuffers(descriptor.bodies.length),
    characters: createCharacterMotorWorld(authored, compiled), kinematicObjectPoses: new Map(), kinematicBodyIndices: new Map() } as PhysicsPlaybackState;
  const retired = vi.fn((id: string) => motors.forget(id));
  const service = createRuntimeEntityBodies(state, settings, retire, retired); state.entities = service;
  const backend: EntityLifecycleBackend = { ...service.backend, prepare(plan, signal) {
    const prepared = service.backend.prepare(plan, signal);
    if ("then" in prepared) throw new Error("Expected synchronous physical preparation.");
    return { ...prepared, publish() { prepared.publish(); if (failPublication()) throw new Error("Following backend publication failed."); } };
  } };
  const world = createEntityWorld({ backend, capacity: 2 });
  const commands = createPhysicsPlaybackCommands({ state: () => state, ready: () => true, motors, onChanged: vi.fn() });
  return { state, service, world, commands, motors, descriptor, upload, writes, writeKinematicBodyPose, reset, retired, authored, source,
    dispose() { world.dispose(); state.characters?.dispose(); upload.dispose(); motors.reset(); } };
}

it("admits the first runtime character without an authored CC and constrains its command pose against the static floor", () => {
  const f = fixture();
  expect(f.state.characters!.stats()).toEqual({ characters: 0, results: 0, removed: 0, staticBodies: 0 });
  const ticket = f.world.port.submit([creation()]); f.world.flush(1); const entity = handle(ticket);
  const id = f.service.runtimeCharacterId(entity)!;
  expect(f.state.characters!.stats()).toMatchObject({ characters: 1, staticBodies: 1 });
  expect(f.descriptor.bodies[1]).toMatchObject({ mass: 0, gravityScale: 0, shape: { kind: "capsule", radius: 0.35, halfLength: 0.55 },
    binding: { bodyType: "kinematic", colliderId: "saved-capsule", objectId: id, objectLocalOffset: [0, -0.9, 0] } });
  expect(f.state.kinematicBodyIndices.get(id)).toEqual([1]);
  const moved = f.commands.moveRuntimeCharacter(entity, [0, -1, 0]);
  expect(moved).toMatchObject({ grounded: true, scope: "static", queued: true });
  expect(moved.position[1]).toBeCloseTo(0.02, 4);
  expect(f.writeKinematicBodyPose.mock.calls[0][0]).toBe(1);
  expect(f.writeKinematicBodyPose.mock.calls[0][1][1]).toBeCloseTo(0.92, 4);
  expect(f.commands.snapshotRuntimeCharacter(entity)?.position).toEqual(moved.position);
  expect(f.authored).toEqual(f.source);
  f.dispose();
});

it("rolls back both character creation and removal without losing the removed pose, result or sink", () => {
  let fail = true; const f = fixture(async () => undefined, () => fail);
  const rejected = f.world.port.submit([creation()]); f.world.flush(1);
  expect(rejected.read()).toMatchObject({ status: "rejected", code: "backend-failed" });
  expect(f.state.characters!.stats()).toMatchObject({ characters: 0, results: 0 });
  expect(f.state.kinematicObjectPoses.size).toBe(0); expect(f.upload.port.activeCount()).toBe(1);
  fail = false; const created = f.world.port.submit([creation()]); f.world.flush(2); const entity = handle(created);
  const id = f.service.runtimeCharacterId(entity)!;
  f.commands.moveRuntimeCharacter(entity, [0.4, -1, 0]);
  const pose = f.state.kinematicObjectPoses.get(id), result = f.state.characters!.result(id);
  const sink = f.commands.runtimeCharacterMotorFor(entity)!;
  fail = true; const removed = f.world.port.destroy(entity); f.world.flush(3);
  expect(removed.read()).toMatchObject({ status: "rejected" });
  expect(f.world.port.isAlive(entity)).toBe(true); expect(f.service.runtimeCharacterId(entity)).toBe(id);
  expect(f.state.kinematicObjectPoses.get(id)).toBe(pose); expect(f.state.characters!.result(id)).toBe(result);
  expect(f.commands.runtimeCharacterMotorFor(entity)).toBe(sink); expect(f.retired).not.toHaveBeenCalled();
  expect(f.upload.port.activeCount()).toBe(2);
  f.dispose();
});

it("rejects stale/foreign handles and forgets old root-motion sinks only on committed retirement", async () => {
  let finish!: () => void; const f = fixture(() => new Promise<void>((resolve) => { finish = resolve; }));
  const created = f.world.port.submit([creation()]); f.world.flush(1); const entity = handle(created);
  const sink = f.commands.runtimeCharacterMotorFor(entity)!;
  const foreign = { ...entity, world: Symbol("other-world") };
  expect(f.commands.runtimeCharacterMotorFor(foreign)).toBeUndefined();
  expect(() => f.commands.moveRuntimeCharacter(foreign, [1, 0, 0])).toThrow(/entity handle/);
  f.world.port.destroy(entity); f.world.flush(2);
  expect(f.service.runtimeCharacterId(entity)).toBeUndefined(); expect(f.commands.runtimeCharacterMotorFor(entity)).toBeUndefined();
  expect(f.state.characters!.stats()).toMatchObject({ characters: 0, results: 0, removed: 0 });
  sink.applyRootMotion({ characterId: "unrelated-animator-id", delta: { translation: [4, 0, 0], rotation: [0, 0, 0, 1] }, fixedDeltaSeconds: 1 / 60 });
  expect(f.motors.diagnostics()).toEqual({ sinks: 0, pending: 0 });
  const early = f.world.port.submit([creation()]); f.world.flush(3); expect(early.read()).toMatchObject({ status: "rejected", code: "capacity" });
  await Promise.resolve(); finish(); await vi.waitFor(() => expect(f.world.port.stats().retiring).toBe(0));
  const next = f.world.port.submit([creation([3, 0, 0])]); f.world.flush(4); const fresh = handle(next);
  expect(fresh.generation).toBeGreaterThan(entity.generation); expect(f.commands.snapshotRuntimeCharacter(fresh)).toMatchObject({ position: [3, 0, 0], grounded: false });
  expect(f.state.characters!.result(f.service.runtimeCharacterId(fresh)!)).toBeUndefined();
  expect(f.upload.port.generation(1)).toBe(2);
  f.dispose();
});

it("maps root motion by exact entity ownership and updates only its reserved capsule slot", () => {
  const f = fixture(); const created = f.world.port.submit([creation()]); f.world.flush(1); const entity = handle(created);
  const sink = f.commands.runtimeCharacterMotorFor(entity)!;
  sink.applyRootMotion({ characterId: "runtime-animator:random-id", delta: { translation: [0.3, 0, 0], rotation: [0, 0, 0, 1] }, fixedDeltaSeconds: 1 / 60 });
  expect(f.writeKinematicBodyPose).not.toHaveBeenCalled();
  f.motors.flush(characterMotorState(f.state), vi.fn());
  expect(f.writeKinematicBodyPose).toHaveBeenCalledOnce(); expect(f.writeKinematicBodyPose.mock.calls[0][0]).toBe(1);
  expect(f.commands.snapshotRuntimeCharacter(entity)?.position[0]).toBeCloseTo(0.3);
  expect(f.motors.diagnostics()).toEqual({ sinks: 1, pending: 0 });
  f.dispose();
});

it("keeps the last accepted character pose, result and GPU target when finite displacement overflows f32", () => {
  const f = fixture(), writeBuffer = vi.fn();
  vi.stubGlobal("GPUBufferUsage", { STORAGE: 1, COPY_DST: 2, UNIFORM: 4 });
  const device = { queue: { writeBuffer }, createBuffer: ({ size }: { size: number }) => ({
    getMappedRange: () => new ArrayBuffer(size), unmap() {}, destroy() {},
  }) } as unknown as GPUDevice;
  const commands = createRigidBodyCommands(device, f.descriptor, {} as GPUComputePipeline,
    {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, []);
  try {
    f.state.runtime.writeKinematicBodyPose = (body, position, orientation) => commands.queue({ kind: "kinematic-target", body, position, orientation });
    const created = f.world.port.submit([creation()]); f.world.flush(1); const entity = handle(created);
    const id = f.service.runtimeCharacterId(entity)!;
    f.commands.moveRuntimeCharacter(entity, [0, -1, 0]);
    const pose = f.state.kinematicObjectPoses.get(id), result = f.state.characters!.result(id);
    expect(result?.grounded).toBe(true);

    expect(() => f.commands.moveRuntimeCharacter(entity, [1e39, 0, 0], 90)).toThrow("finite f32");
    expect(f.state.kinematicObjectPoses.get(id)).toBe(pose);
    expect(f.state.characters!.result(id)).toBe(result);
    commands.upload(); expect(writeBuffer).toHaveBeenCalledOnce();
    const accepted = writeBuffer.mock.calls[0][2] as Float32Array;
    expect(accepted[0]).toBe(0); expect(accepted[1]).toBeCloseTo(0.92, 4);

    const moved = f.commands.moveRuntimeCharacter(entity, [0.4, 0, 0], 90);
    expect(moved.position[0]).toBeCloseTo(0.4); expect(moved.grounded).toBe(true);
    expect(f.state.kinematicObjectPoses.get(id)).not.toBe(pose);
    expect(f.state.characters!.result(id)).not.toBe(result);
    commands.upload(); expect(writeBuffer).toHaveBeenCalledTimes(2);
    const turned = writeBuffer.mock.calls[1][2] as Float32Array;
    expect(turned[0]).toBeCloseTo(0.4); expect(turned[5]).toBeCloseTo(Math.SQRT1_2); expect(turned[7]).toBeCloseTo(Math.SQRT1_2);
  } finally { commands.destroy(); f.dispose(); vi.unstubAllGlobals(); }
});

it("commands absolute yaw with world displacement and rejects invalid angles before changing motor state", () => {
  const f = fixture(), created = f.world.port.submit([creation()]); f.world.flush(1); const entity = handle(created);
  f.commands.moveRuntimeCharacter(entity, [0.2, -1, 0], 90);
  f.commands.moveRuntimeCharacter(entity, [0.2, 0, 0], 270);
  const pose = f.commands.snapshotRuntimeCharacter(entity)!;
  expect(pose.position[0]).toBeCloseTo(0.4); expect(pose.rotation[1]).toBeCloseTo(-Math.SQRT1_2);
  expect(pose.rotation[3]).toBeCloseTo(Math.SQRT1_2); expect(f.writeKinematicBodyPose).toHaveBeenCalledTimes(2);
  const result = f.state.characters!.result(f.service.runtimeCharacterId(entity)!);
  for (const yaw of [NaN, Infinity, -Infinity]) expect(() => f.commands.moveRuntimeCharacter(entity, [1, 0, 0], yaw)).toThrow(/finite angle/);
  expect(f.commands.snapshotRuntimeCharacter(entity)).toEqual(pose);
  expect(f.state.characters!.result(f.service.runtimeCharacterId(entity)!)).toBe(result);
  expect(f.writeKinematicBodyPose).toHaveBeenCalledTimes(2); f.dispose();
});

it("reuses the cold static BVH for camera sphere casts and excludes committed authored removals", () => {
  const f = fixture(), query = { origin: [0, 3, 0] as [number, number, number], direction: [0, -1, 0] as [number, number, number], maxDistance: 5, radius: 0.25 };
  expect(f.state.characters!.stats().staticBodies).toBe(0);
  const hit = f.commands.sweepStaticSphere(query)!;
  expect(hit).toMatchObject({ objectId: "floor", scope: "static" }); expect(hit.distance).toBeCloseTo(2.75);
  expect(f.state.characters!.stats().staticBodies).toBe(1);
  f.state.characters!.setRemoved("floor", true); expect(f.commands.sweepStaticSphere(query)).toBeNull();
  expect(f.state.characters!.stats().staticBodies).toBe(1);
  expect(f.writeKinematicBodyPose).not.toHaveBeenCalled(); f.dispose();
});

it("reuses a pooled physical slot with fresh character defaults and stable instanced render groups", async () => {
  const f = fixture(), pool = f.world.reservations.allocate(1), token = pool.tokens[0];
  const view = { scene: new Scene(), disposed: false, framesSinceSceneChange: 0 } as Runtime;
  f.service.present(view); const groups = view.scene.children as Mesh<InstancedBufferGeometry>[];
  const first = pool.submit([creation()], new Map([["hero", token]])); f.world.flush(1); const old = handle(first);
  f.commands.moveRuntimeCharacter(old, [1, -1, 0]);
  pool.submit([{ op: "destroy", handle: old }]); f.world.flush(2);
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  expect(pool.state(token)).toBe("idle");
  const next = pool.submit([creation([5, 0, 0])], new Map([["hero", token]])); f.world.flush(3); const fresh = handle(next);
  expect(fresh.slot).toBe(old.slot); expect(fresh.generation).toBeGreaterThan(old.generation);
  expect(f.commands.snapshotRuntimeCharacter(fresh)).toMatchObject({ position: [5, 0, 0], grounded: false });
  expect(f.state.characters!.result(f.service.runtimeCharacterId(fresh)!)).toBeUndefined();
  expect(view.scene.children).toEqual(groups);
  f.upload.upload(); expect(f.reset).toHaveBeenLastCalledWith(1, false);
  expect(f.state.characters!.stats()).toMatchObject({ characters: 1, results: 0, staticBodies: 1 });
  f.dispose();
});
