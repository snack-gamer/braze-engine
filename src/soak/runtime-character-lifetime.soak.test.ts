import { expect, it, vi } from "vitest";
import { Scene } from "three";
import { makeObject } from "../lib/payload";
import { defaultColliderForObject } from "../physics/authoring/component-defaults";
import { compileAuthoredPhysicsScene } from "../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../physics/authoring/rigid-world-compiler";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "../physics/domain/world-settings";
import { reserveRigidBodySlots } from "../physics/runtime/rigid-body-slots";
import { createRigidSlotUpload } from "../physics/gpu/rigid-slot-upload";
import type { createRigidBodyCommands } from "../physics/gpu/rigid-body-commands";
import { createCharacterMotorWorld } from "../character-controller/runtime/character-motor-world";
import { captureRuntimeCharacter, RUNTIME_CHARACTER_COMPONENTS } from "../character-controller/domain/runtime-character";
import { createRuntimeEntityBodies } from "../three/physics/runtime-entity-bodies";
import { applyKinematicMotorDelta } from "../three/physics/kinematic-character-motor";
import { PhysicsPoseBuffers } from "../three/physics/gpu-pose";
import type { PhysicsPlaybackSolver } from "../three/physics/playback-backend";
import type { RootMotionPose } from "../character/runtime/root-motion";
import type { Runtime } from "../three/runtime";
import { createEntityWorld } from "../world/runtime/entity-world";
import type { EntityHandle } from "../world/domain/entity-world";
import { createRuntimePrefabs } from "../prefabs/runtime/runtime-prefabs";
import { compileRuntimePrefabLibrary } from "../prefabs/adapters/runtime-prefab-compiler";
// @ts-expect-error Node fixture modules intentionally have no TypeScript declarations.
import { runtimeCharacterPrefabDocument } from "../../tests/gameplay/runtime-character-project.mjs";

const drain = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };

it("repeats 1,000 pooled capsule-motor lifetimes with reversible publication, fresh command state and fenced reuse", async () => {
  for (let run = 0; run < 20; run++) {
    const floor = makeObject("cube", 0, { id: "floor", position: [0, -0.5, 0] });
    floor.colliders = [{ ...defaultColliderForObject(floor), size: [30, 1, 30] }];
    const wall = makeObject("cube", 1, { id: "wall", position: [3, 2, 0] });
    wall.colliders = [{ ...defaultColliderForObject(wall), size: [0.2, 4, 5] }];
    const objects = [floor, wall], original = structuredClone(objects);
    const descriptor = reserveRigidBodySlots(compileRigidWorld(compileAuthoredPhysicsScene(objects, "character-soak", settings)), 1);
    const upload = createRigidSlotUpload({ queue: { writeBuffer() {} } } as unknown as GPUDevice, descriptor,
      {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, [], { reset() {} } as unknown as ReturnType<typeof createRigidBodyCommands>);
    const characters = createCharacterMotorWorld(objects, descriptor);
    const kinematicObjectPoses = new Map<string, RootMotionPose>(), kinematicBodyIndices = new Map<string, number[]>();
    const writeKinematicBodyPose = vi.fn(), onRetired = vi.fn();
    const state = { runtime: { bodySlots: upload.port, writeKinematicBodyPose } as unknown as PhysicsPlaybackSolver,
      bodyBindings: descriptor.bodies.map((body) => body.binding), poseBuffers: new PhysicsPoseBuffers(descriptor.bodies.length),
      characters, kinematicObjectPoses, kinematicBodyIndices };
    let fence = Promise.resolve();
    const service = createRuntimeEntityBodies(state, settings, () => fence, onRetired);
    const view = { scene: new Scene(), disposed: false, framesSinceSceneChange: 0 } as Runtime;
    service.present(view);
    const signal = new AbortController().signal;
    const abandoned = { world: Symbol("abandoned"), slot: 99, generation: 1 };
    const prepared = service.backend.prepare({ created: [{ key: "abandoned", entity: { handle: abandoned, name: "Abandoned", tags: [], components: RUNTIME_CHARACTER_COMPONENTS,
      character: captureRuntimeCharacter({ position: [-1.2, 0.15, 0], capsule: { id: "capsule", center: [0, 0.9, 0], radius: 0.35, halfLength: 0.55 }, render: { shape: { kind: "box", size: [1, 1, 1] }, color: "#29d6ff" } }) } }], removed: [] }, signal);
    if ("then" in prepared) throw new Error("Character slot publication must remain synchronous.");
    expect(service.runtimeCharacterId(abandoned)).toBeUndefined(); prepared.publish();
    expect(service.runtimeCharacterId(abandoned)).toBeTruthy(); prepared.rollback(); prepared.rollback();
    expect(service.runtimeCharacterId(abandoned)).toBeUndefined(); expect(kinematicObjectPoses.size).toBe(0);
    expect(kinematicBodyIndices.size).toBe(0); expect(upload.port.activeCount()).toBe(2);

    const world = createEntityWorld({ capacity: 2, backend: service.backend });
    const asset = { guid: "c".repeat(32), localId: "main" };
    const templates = compileRuntimePrefabLibrary([{ asset, revision: "character-soak-v1", name: "Character", document: runtimeCharacterPrefabDocument() }]);
    const capsule = templates[0].create().flatMap((command) => command.op === "create" && command.character ? [command.character.capsule] : [])[0];
    const startY = capsule.radius + capsule.halfLength - capsule.center[1] + 0.15;
    const prefabs = createRuntimePrefabs(world.port, templates, world.reservations), pool = prefabs.createPool(asset, { capacity: 1 });
    let previous: EntityHandle | undefined;
    for (let cycle = 0; cycle < 50; cycle++) {
      const ticket = pool.acquire({ position: [-1.2, startY, 0] }); world.flush(cycle * 2 + 1); upload.upload();
      const result = ticket.read(); if (result.status !== "committed") throw new Error(JSON.stringify(result));
      const handle = result.instance.entities.character, id = service.runtimeCharacterId(handle)!;
      expect(id).toBeTruthy(); expect(characters.has(id)).toBe(true); expect(characters.result(id)).toBeUndefined();
      expect(kinematicObjectPoses.get(id)!.position).toEqual([-1.2, startY, 0]);
      expect(kinematicBodyIndices.get(id)).toEqual([2]); expect(upload.port.activeCount()).toBe(3);
      if (previous) { expect(service.runtimeCharacterId(previous)).toBeUndefined(); expect(world.port.isAlive(previous)).toBe(false); expect(handle.generation).toBeGreaterThan(previous.generation); }
      const motor = { runtime: state.runtime, bodyBindings: state.bodyBindings, objectPoses: kinematicObjectPoses,
        bodyIndices: kinematicBodyIndices, prepareMovement: characters.prepareMovement };
      applyKinematicMotorDelta(motor, id, { translation: [0, -0.15, 0], rotation: [0, 0, 0, 1] }, () => undefined);
      expect(characters.result(id)!.grounded).toBe(true);
      applyKinematicMotorDelta(motor, id, { translation: [20, 0, 0], rotation: [0, 0, 0, 1] }, () => undefined);
      expect(kinematicObjectPoses.get(id)!.position[0]).toBeGreaterThan(2.4);
      expect(kinematicObjectPoses.get(id)!.position[0]).toBeLessThan(2.56);
      expect(writeKinematicBodyPose).toHaveBeenCalled();
      if (cycle % 10 === 0) {
        const pose = kinematicObjectPoses.get(id), collision = characters.result(id);
        const removal = service.backend.prepare({ created: [], removed: [world.port.inspect(handle)] }, signal);
        if ("then" in removal) throw new Error("Character removal must remain synchronous.");
        removal.publish(); expect(service.runtimeCharacterId(handle)).toBeUndefined(); expect(characters.has(id)).toBe(false);
        expect(kinematicObjectPoses.has(id)).toBe(false); removal.rollback();
        expect(service.runtimeCharacterId(handle)).toBe(id); expect(characters.has(id)).toBe(true);
        expect(kinematicObjectPoses.get(id)).toBe(pose); expect(characters.result(id)).toBe(collision);
      }
      let release!: () => void;
      fence = new Promise<void>((resolve) => { release = resolve; });
      pool.release(result.instance); world.flush(cycle * 2 + 2); upload.upload(); await drain();
      expect(service.runtimeCharacterId(handle)).toBeUndefined(); expect(characters.has(id)).toBe(false); expect(characters.result(id)).toBeUndefined();
      expect(kinematicObjectPoses.size).toBe(0); expect(kinematicBodyIndices.size).toBe(0);
      expect(pool.stats().available).toBe(0); expect(world.port.stats().retiring).toBe(2);
      release(); await drain();
      expect(pool.stats()).toMatchObject({ available: 1, retained: 1, reuses: cycle });
      expect(world.port.stats()).toMatchObject({ allocatedSlots: 2, reserved: 2, dormant: 2, runtime: 0, retiring: 0, quarantined: 0 });
      expect(upload.port.activeCount()).toBe(2); expect(descriptor.bodies.length).toBe(3);
      expect(onRetired).toHaveBeenCalledTimes(cycle + 1); previous = handle;
    }
    pool.dispose(); expect(world.port.stats().reserved).toBe(0);
    world.dispose(); service.dispose(); characters.dispose(); upload.dispose(); await drain();
    expect(view.scene.children).toHaveLength(0); expect(objects).toEqual(original);
    expect(service.runtimeCharacterId(previous!)).toBeUndefined();
  }
});
