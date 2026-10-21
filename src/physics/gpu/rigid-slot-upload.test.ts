import { expect, it, vi } from "vitest";
import { createRigidSlotUpload } from "./rigid-slot-upload";
import { emptyRigidBody, reserveRigidBodySlots } from "../runtime/rigid-body-slots";
import type { RigidBodyDescriptor } from "../runtime/rigid-world-descriptor";
import type { createRigidBodyCommands } from "./rigid-body-commands";

function fixture() {
  const world = reserveRigidBodySlots({ bodies: [emptyRigidBody(0)], gravity: [0, -9.81, 0], fixedTimestep: 1 / 60 }, 2);
  const writeBuffer = vi.fn(), commands = { reset: vi.fn() } as unknown as ReturnType<typeof createRigidBodyCommands>;
  const buffers = Array.from({ length: 5 }, () => ({} as GPUBuffer));
  const slots = createRigidSlotUpload({ queue: { writeBuffer } } as unknown as GPUDevice, world, buffers[0], buffers[1], buffers[2], buffers.slice(3), commands);
  const dynamic = (): RigidBodyDescriptor => ({ ...emptyRigidBody(1), binding: { ...emptyRigidBody(1).binding, bodyType: "dynamic" }, mass: 1, inertia: [1, 1, 1], shape: { kind: "box", halfExtents: [0.5, 0.5, 0.5] }, position: [0, 3, 0] });
  return { world, slots, dynamic, writeBuffer, commands };
}

it("uploads only changed slots and preserves queued commands on newly created bodies", () => {
  const f = fixture(), change = f.slots.port.prepare([{ index: 1, body: f.dynamic(), velocity: [2, 0, 0] }]);
  expect(f.slots.port.activeCount()).toBe(1); expect(f.writeBuffer).not.toHaveBeenCalled();
  change.publish(); expect(f.slots.port.activeCount()).toBe(2); expect(f.slots.port.generation(1)).toBe(1);
  f.slots.upload(); expect(f.writeBuffer).toHaveBeenCalledTimes(5);
  expect(f.writeBuffer.mock.calls.every(([, offset]) => offset > 0)).toBe(true);
  expect(f.commands.reset).toHaveBeenCalledWith(1, false);
  expect(Array.from(f.writeBuffer.mock.calls[3][2] as Float32Array)).toEqual([2, 0, 0, 0, 0, 0, 0, 0]);
  const properties = f.writeBuffer.mock.calls[2][2] as Float32Array;
  expect(new Uint32Array(properties.buffer)[23]).toBe(1);
  f.writeBuffer.mockClear(); f.slots.upload(); expect(f.writeBuffer).not.toHaveBeenCalled();
  f.slots.port.prepare([{ index: 1, body: null }]).publish(); f.slots.upload();
  expect(f.commands.reset).toHaveBeenLastCalledWith(1, true); expect(f.slots.port.generation(1)).toBe(-1);
  f.slots.port.prepare([{ index: 1, body: f.dynamic() }]).publish(); expect(f.slots.port.generation(1)).toBe(2);
});

it("admits solid upright kinematic capsules through the same sparse slot transaction", () => {
  const f = fixture();
  const character: RigidBodyDescriptor = { ...emptyRigidBody(1), binding: { ...emptyRigidBody(1).binding, bodyType: "kinematic" },
    shape: { kind: "capsule", radius: 0.35, halfLength: 0.55 }, position: [1, 2, 3], collisionMask: 0xffffffff };
  const change = f.slots.port.prepare([{ index: 1, body: character }]);
  change.publish(); f.slots.upload();
  expect((f.writeBuffer.mock.calls[0][2] as Float32Array)[3]).toBe(-1);
  expect(Array.from(f.writeBuffer.mock.calls[2][2] as Float32Array).slice(0, 4)).toEqual([Math.fround(0.35), Math.fround(0.55), 0, 2]);
  expect(f.commands.reset).toHaveBeenCalledWith(1, false);
  f.slots.port.prepare([{ index: 1, body: null }]).publish(); f.slots.upload();
  expect(f.commands.reset).toHaveBeenLastCalledWith(1, true);
  expect(f.slots.port.generation(1)).toBe(-1);
});

it("rejects non-character capsule variants before publishing any reserved slot", () => {
  const f = fixture();
  const character: RigidBodyDescriptor = { ...emptyRigidBody(1), binding: { ...emptyRigidBody(1).binding, bodyType: "kinematic" },
    shape: { kind: "capsule", radius: 0.35, halfLength: 0.55 } };
  const invalid: RigidBodyDescriptor[] = [
    { ...character, isTrigger: true }, { ...character, gravityScale: 1 }, { ...character, mass: 1 },
    { ...character, orientation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] },
    { ...character, orientation: [0, 0, 0, 0] }, { ...character, shape: { kind: "capsule", radius: 0, halfLength: 0.55 } },
    { ...character, binding: { ...character.binding, bodyType: "dynamic" }, mass: 1 },
  ];
  for (const body of invalid) expect(() => f.slots.port.prepare([{ index: 1, body: f.dynamic() }, { index: 2, body }])).toThrow(/Runtime slots/);
  expect(f.slots.port.activeCount()).toBe(1); expect(f.slots.port.generation(1)).toBe(-1);
  f.slots.upload(); expect(f.writeBuffer).not.toHaveBeenCalled();
});

it("validates batches atomically, rejects stale preparations and rolls publication back before upload", () => {
  const f = fixture();
  expect(() => f.slots.port.prepare([{ index: 1, body: f.dynamic() }, { index: 3, body: f.dynamic() }])).toThrow();
  expect(f.slots.port.activeCount()).toBe(1);
  const first = f.slots.port.prepare([{ index: 1, body: f.dynamic() }]);
  const stale = f.slots.port.prepare([{ index: 1, body: f.dynamic() }]); first.publish();
  expect(() => stale.publish()).toThrow(/changed after/); first.rollback(); f.slots.upload();
  expect(f.writeBuffer).not.toHaveBeenCalled(); expect(f.slots.port.activeCount()).toBe(1);
  expect(f.world.bodies[1].mass).toBe(0); expect(f.slots.port.generation(1)).toBe(-1);
  const late = f.slots.port.prepare([{ index: 1, body: f.dynamic() }]); f.slots.dispose();
  expect(() => late.publish()).toThrow(); expect(() => f.slots.port.prepare([])).toThrow(/ended/);
});

it("removes authored slots without a runtime reserve and never allows their reuse", () => {
  const f = fixture(), original = f.world.bodies[0];
  expect(f.slots.port.generation(0)).toBe(0);
  const change = f.slots.port.prepare([{ index: 0, body: null }]); change.publish();
  expect(f.slots.port.activeCount()).toBe(0); expect(f.slots.port.generation(0)).toBe(-1);
  expect(() => f.slots.port.prepare([{ index: 0, body: f.dynamic() }])).toThrow(/Authored/);
  change.rollback(); f.slots.upload(); expect(f.writeBuffer).not.toHaveBeenCalled();
  expect(f.world.bodies[0]).toBe(original); expect(f.slots.port.generation(0)).toBe(0);
  f.slots.port.prepare([{ index: 0, body: null }]).publish(); f.slots.upload();
  expect(f.writeBuffer).toHaveBeenCalledTimes(5); expect(f.commands.reset).toHaveBeenCalledWith(0, true);
  expect(f.writeBuffer.mock.calls.every(([, offset]) => offset === 0)).toBe(true);
  expect(() => f.slots.port.prepare([{ index: 0, body: null }])).toThrow(/inactive/);
});
