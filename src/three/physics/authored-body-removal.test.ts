import { expect, it, vi } from "vitest";
import { createRuntimeEntityBodies } from "./runtime-entity-bodies";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { createRigidSlotUpload } from "../../physics/gpu/rigid-slot-upload";
import { emptyRigidBody } from "../../physics/runtime/rigid-body-slots";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "../../physics/domain/world-settings";
import type { createRigidBodyCommands } from "../../physics/gpu/rigid-body-commands";
import type { PhysicsPlaybackState } from "./physics-playback-state";
import type { PhysicsPlaybackSolver } from "./playback-backend";
import { PhysicsPoseBuffers } from "./gpu-pose";

it("removes every authored collider, revokes character ownership, and retires without reusing authored body indices", async () => {
  const bodies = [0, 1, 2].map((index) => ({ ...emptyRigidBody(index), binding: { ...emptyRigidBody(index).binding, objectId: index < 2 ? "target" : "other" } }));
  const descriptor = { bodies, gravity: [0, -9.81, 0] as [number, number, number], fixedTimestep: 1 / 60 };
  const writes = vi.fn();
  const upload = createRigidSlotUpload({ queue: { writeBuffer: writes } } as unknown as GPUDevice, descriptor,
    {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, [], { reset() {} } as unknown as ReturnType<typeof createRigidBodyCommands>);
  const setRemoved = vi.fn(), retire = vi.fn();
  const state = { runtime: { bodySlots: upload.port } as PhysicsPlaybackSolver, bodyBindings: bodies.map((body) => body.binding), poseBuffers: new PhysicsPoseBuffers(3),
    characters: { setRemoved, retire } as unknown as NonNullable<PhysicsPlaybackState["characters"]>,
    kinematicObjectPoses: new Map([["target", { position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const }]]),
    kinematicBodyIndices: new Map([["target", [0, 1]]]) };
  let finish!: () => void;
  const fence = new Promise<void>((resolve) => { finish = resolve; });
  const service = createRuntimeEntityBodies(state, settings, () => fence);
  const world = createEntityWorld({ authored: [{ id: "target", name: "Target" }, { id: "other", name: "Other" }], backend: service.backend });
  const ticket = world.port.destroy(world.port.findByAuthoredId("target")!); world.flush(1);
  expect(ticket.read()).toMatchObject({ status: "committed", removed: 1 });
  expect(upload.port.activeCount()).toBe(1); expect(upload.port.generation(2)).toBe(0);
  expect(setRemoved).toHaveBeenCalledWith("target", true); expect(retire).toHaveBeenCalledWith("target");
  expect(state.kinematicObjectPoses.size).toBe(0); expect(state.kinematicBodyIndices.size).toBe(0);
  expect(state.bodyBindings[0].writesObjectPose).toBe(false); expect(state.bodyBindings[2]).toBe(bodies[2].binding);
  expect(world.port.stats().retiring).toBe(1); upload.upload(); expect(writes).toHaveBeenCalledTimes(6);
  finish(); await vi.waitFor(() => expect(world.port.stats().retiring).toBe(0)); world.dispose();
});
