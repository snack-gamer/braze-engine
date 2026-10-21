import { expect, it, vi } from "vitest";
import type { EntityHandle, EntityWorld, WorldEntity } from "../../world/domain/entity-world";
import { EntityWorldError } from "../../world/domain/entity-world";
import { captureRuntimeCharacter } from "../domain/runtime-character";
import { createGameCharacterCommands } from "./game-character-commands";
import { captureRuntimeModel } from "../../world/domain/runtime-model";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";

function setup() {
  const handle: EntityHandle = { world: Symbol(), slot: 1, generation: 3 };
  const character = captureRuntimeCharacter({ position: [0, 0, 0], capsule: { id: "cap", center: [0, 0.9, 0], radius: 0.35, halfLength: 0.55 },
    render: { shape: { kind: "box", size: [0.5, 1.8, 0.5] }, color: "#eeb33b" } });
  let entity: WorldEntity = { handle, name: "Runtime hero", tags: [], components: [], character };
  let alive = true, physicsReady = true;
  const isAlive = (target: EntityHandle) => alive && target.world === entity.handle.world && target.slot === entity.handle.slot && target.generation === entity.handle.generation;
  const inspect = vi.fn((target: EntityHandle) => {
    if (!isAlive(target)) throw new EntityWorldError("stale-handle", "Old character handle.");
    return entity;
  });
  const entities = { inspect, isAlive, findByAuthoredId: () => entity.handle } as unknown as EntityWorld;
  const position: [number, number, number] = [1, 2, 3];
  const moveCharacter = vi.fn((_id: string, _delta: [number, number, number], _yaw?: number) => ({ position, grounded: true, scope: "static" as const }));
  const moveRuntimeCharacter = vi.fn((_handle: EntityHandle, _delta: [number, number, number], _yaw?: number) => ({ position, grounded: true, scope: "static" as const }));
  const pose = { position, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as const, grounded: true };
  const snapshotCharacter = vi.fn(() => pose), snapshotRuntimeCharacter = vi.fn(() => pose);
  const abort = new AbortController(); let inTick = true;
  const authoredAppliedRootMotion = new Set<string>();
  const commands = createGameCharacterCommands({ entities, authoredCharacters: new Set(["authored"]), authoredAppliedRootMotion,
    signal: abort.signal, inFixedTick: () => inTick, physics: () => physicsReady ? { moveCharacter, moveRuntimeCharacter, snapshotCharacter, snapshotRuntimeCharacter } : null });
  return { commands, handle, position, abort, moveCharacter, moveRuntimeCharacter, snapshotCharacter, authoredAppliedRootMotion,
    entity: () => entity, remove() { alive = false; }, setPhysicsReady(value: boolean) { physicsReady = value; },
    setEntity(next: WorldEntity) { entity = next; alive = true; }, setInTick(value: boolean) { inTick = value; } };
}

it("routes runtime generation handles and authored IDs to their respective motors, returning immutable command poses", () => {
  const f = setup(), displacement: [number, number, number] = [1, 0, 0];
  const result = f.commands.port.move(f.handle, displacement);
  expect(f.moveRuntimeCharacter).toHaveBeenCalledWith(f.handle, [1, 0, 0], undefined);
  displacement[0] = 99; f.position[0] = 99;
  expect(f.moveRuntimeCharacter.mock.calls[0][1]).toEqual([1, 0, 0]);
  expect(result.position).toEqual([1, 2, 3]); expect(Object.isFrozen(result.position)).toBe(true);
  f.setEntity({ handle: f.handle, authoredId: "authored", name: "Authored hero", tags: [], components: [] });
  f.moveCharacter.mockClear(); f.commands.port.move("authored", [0, 0, 1]);
  expect(f.moveCharacter).toHaveBeenCalledWith("authored", [0, 0, 1], undefined);
});

it("rejects stale/foreign handles, non-character entities and retained commands outside the admitted tick or after Stop", () => {
  const f = setup();
  expect(() => f.commands.port.move({ ...f.handle, generation: 2 }, [0, 0, 0])).toThrowError(expect.objectContaining({ code: "stale-handle" }));
  expect(() => f.commands.port.move({ ...f.handle, world: Symbol() }, [0, 0, 0])).toThrowError(expect.objectContaining({ code: "stale-handle" }));
  f.setEntity({ handle: f.handle, name: "Not a motor", tags: [], components: [] });
  expect(() => f.commands.port.move(f.handle, [0, 0, 0])).toThrow(/Character Controller/);
  f.setInTick(false); expect(() => f.commands.port.move(f.handle, [0, 0, 0])).toThrow(/fixedUpdate/);
  f.abort.abort(); expect(() => f.commands.port.move(f.handle, [0, 0, 0])).toThrow(/session has ended/);
  expect(f.moveRuntimeCharacter).not.toHaveBeenCalled();
});

it("retains the 128-command budget across authored and runtime movement and resets it for each admitted tick", () => {
  const f = setup();
  for (let i = 0; i < 128; i++) f.commands.port.move(f.handle, [0, 0, 0]);
  expect(() => f.commands.port.move(f.handle, [0, 0, 0])).toThrow(/128 per tick/);
  f.commands.beginTick(); expect(() => f.commands.port.move(f.handle, [0, 0, 0])).not.toThrow();
  expect(f.moveRuntimeCharacter).toHaveBeenCalledTimes(129);
});

it("reads immutable command snapshots outside fixed ticks and reports physics readiness without zero movement", () => {
  const f = setup(); f.setInTick(false);
  const pose = f.commands.port.snapshot(f.handle)!;
  expect(pose).toMatchObject({ position: [1, 2, 3], grounded: true, scope: "static" });
  expect(pose.yawDegrees).toBeCloseTo(90); expect(Object.isFrozen(pose)).toBe(true); expect(Object.isFrozen(pose.position)).toBe(true);
  f.position[0] = 99; expect(pose.position[0]).toBe(1); expect(f.moveRuntimeCharacter).not.toHaveBeenCalled();
  f.setEntity({ handle: f.handle, authoredId: "authored", name: "Authored hero", tags: [], components: [] });
  f.commands.port.snapshot("authored"); expect(f.snapshotCharacter).toHaveBeenCalledWith("authored");
  f.setPhysicsReady(false); expect(f.commands.port.snapshot("authored")).toBeNull();
  f.commands.dispose(); expect(() => f.commands.port.snapshot("authored")).toThrow(/session has ended/);
});

it("grants one writer, rejects direct bypass and keeps released leases inert after reacquisition", () => {
  const f = setup(), lease = f.commands.port.acquire(f.handle, "First person");
  expect(Object.isFrozen(lease.entity)).toBe(true);
  expect(() => f.commands.port.acquire(f.handle, "Third person")).toThrow(/owned by First person/);
  expect(() => f.commands.port.move(f.handle, [1, 0, 0])).toThrow(/use its lease/);
  expect(f.commands.port.snapshot(f.handle)?.grounded).toBe(true);
  lease.move([1, 0, 0], { yawDegrees: 135 }); expect(f.moveRuntimeCharacter).toHaveBeenCalledWith(f.handle, [1, 0, 0], 135);
  lease.release(); lease.release(); expect(() => lease.snapshot()).toThrow(/lease has ended/);
  const next = f.commands.port.acquire(f.handle, "Third person"); lease.release();
  expect(() => f.commands.port.move(f.handle, [0, 0, 0])).toThrow(/owned by Third person/);
  next.release(); expect(() => f.commands.port.move(f.handle, [0, 0, 0])).not.toThrow();
  f.commands.dispose();
});

it("prunes removed generations and keeps pooled replacements safe from old leases and Stop", () => {
  const f = setup(), old = f.commands.port.acquire(f.handle);
  f.remove(); f.commands.beginTick(); expect(() => old.move([0, 0, 0])).toThrow(/Old character handle/);
  const fresh = { ...f.handle, generation: f.handle.generation + 1 };
  f.setEntity({ ...f.entity(), handle: fresh }); const lease = f.commands.port.acquire(fresh);
  old.release(); expect(() => f.commands.port.move(fresh, [0, 0, 0])).toThrow(/use its lease/);
  f.setInTick(false); expect(lease.snapshot()).not.toBeNull(); expect(() => lease.move([0, 0, 0])).toThrow(/fixedUpdate/);
  f.abort.abort(); expect(() => lease.snapshot()).toThrow(/session has ended/); lease.release(); lease.release(); f.commands.dispose();
});

it("charges one existing command for combined leased displacement and yaw", () => {
  const f = setup(), lease = f.commands.port.acquire(f.handle);
  for (let i = 0; i < 128; i++) lease.move([0, 0, 0], { yawDegrees: i });
  expect(() => lease.move([0, 0, 0], { yawDegrees: 0 })).toThrow(/128 per tick/);
  f.commands.beginTick(); lease.move([0, 0, 0], { yawDegrees: 0 }); expect(f.moveRuntimeCharacter).toHaveBeenCalledTimes(129);
  lease.release(); f.commands.dispose();
});

it("rejects script leases over authored or runtime applied Animator motion while preserving legacy commands", () => {
  const f = setup(), animator = createDefaultAnimatorComponent(); animator.rootMotion.mode = "applyToObject";
  const model = () => captureRuntimeModel({ asset: { guid: "a".repeat(32) }, animator, bindings: [], castShadows: true, receiveShadows: true,
    worldTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
  f.setEntity({ ...f.entity(), model: model() });
  expect(() => f.commands.port.acquire(f.handle)).toThrow(/use extractOnly or disabled/);
  expect(() => f.commands.port.move(f.handle, [0, 0, 0])).not.toThrow();
  animator.rootMotion.mode = "extractOnly"; f.setEntity({ ...f.entity(), model: model() });
  const allowed = f.commands.port.acquire(f.handle); allowed.release();
  f.setEntity({ handle: f.handle, authoredId: "authored", name: "Authored hero", tags: [], components: [] });
  f.authoredAppliedRootMotion.add("authored");
  expect(() => f.commands.port.acquire("authored")).toThrow(/Animator root motion owns/);
  expect(() => f.commands.port.move("authored", [0, 0, 0])).not.toThrow(); f.commands.dispose();
});
