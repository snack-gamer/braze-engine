import { expect, it, vi } from "vitest";
import { createRuntimeEntityBodies } from "./runtime-entity-bodies";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { createRigidSlotUpload } from "../../physics/gpu/rigid-slot-upload";
import { reserveRigidBodySlots } from "../../physics/runtime/rigid-body-slots";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "../../physics/domain/world-settings";
import type { createRigidBodyCommands } from "../../physics/gpu/rigid-body-commands";
import type { PhysicsPlaybackSolver } from "./playback-backend";
import { PhysicsPoseBuffers } from "./gpu-pose";
import type { EntityBatch, EntityCommand } from "../../world/domain/entity-world";

const create: EntityCommand = { op: "create", key: "body", name: "Body", primitive: {
  shape: { kind: "box", size: [0.8, 0.8, 0.8] }, position: [0, 3, 0], mass: 2, color: "#ffb020",
} };
const handle = (ticket: EntityBatch) => { const state = ticket.read(); if (state.status !== "committed") throw new Error("Expected commit"); return state.created.body; };

it("integrates logical commits with physical capacity, exact dimensions and delayed reuse", async () => {
  const descriptor = reserveRigidBodySlots({ bodies: [], gravity: [0, -9.81, 0], fixedTimestep: 1 / 60 }, 1);
  const upload = createRigidSlotUpload({ queue: { writeBuffer() {} } } as unknown as GPUDevice, descriptor,
    {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, [], { reset() {} } as unknown as ReturnType<typeof createRigidBodyCommands>);
  let finish!: () => void;
  const retirement = new Promise<void>((resolve) => { finish = resolve; });
  const state = { runtime: { bodySlots: upload.port } as PhysicsPlaybackSolver, bodyBindings: descriptor.bodies.map((body) => body.binding), poseBuffers: new PhysicsPoseBuffers(1) };
  const service = createRuntimeEntityBodies(state, settings, () => retirement);
  const world = createEntityWorld({ backend: service.backend, capacity: 4 });
  const first = world.port.submit([create]); world.flush(1);
  expect(upload.port.activeCount()).toBe(1);
  expect(descriptor.bodies[0].shape).toEqual({ kind: "box", halfExtents: [0.4, 0.4, 0.4] });
  expect(descriptor.bodies[0].mass).toBe(2);
  world.port.submit([{ op: "destroy", handle: handle(first) }]); world.flush(2);
  expect(upload.port.activeCount()).toBe(0); expect(world.port.stats().retiring).toBe(1);
  const early = world.port.submit([create]); world.flush(3); expect(early.read()).toMatchObject({ code: "capacity" });
  finish(); await vi.waitFor(() => expect(world.port.stats().retiring).toBe(0));
  const replacement = world.port.submit([create]); world.flush(4);
  expect(handle(replacement).generation).toBeGreaterThan(handle(first).generation);
  expect(upload.port.generation(0)).toBe(2); expect(world.port.isAlive(handle(first))).toBe(false);
  world.dispose(); service.dispose();
});

it("captures primitive data, rejects malformed spawns and requires the complete supported component set", () => {
  const world = createEntityWorld();
  expect(() => world.port.submit([{ ...create, primitive: { ...create.primitive!, mass: -1 } }])).toThrow(/mass/);
  expect(() => world.port.submit([{ ...create, components: ["meshRenderer"] }])).toThrow(/requires/);
  const spec = { shape: { kind: "sphere" as const, radius: 0.5 }, position: [1, 2, 3] as [number, number, number], mass: 1, color: "#abcdef" };
  const batch = world.port.submit([{ op: "create", key: "s", name: "Sphere", primitive: spec }]);
  spec.position[0] = NaN; world.flush(1);
  expect(batch.read()).toMatchObject({ code: "unsupported-component" }); world.dispose();
});
