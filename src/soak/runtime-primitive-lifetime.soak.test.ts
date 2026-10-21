import { expect, it, vi } from "vitest";
import { Scene, type Mesh, type InstancedBufferGeometry, type InstancedBufferAttribute } from "three";
import { createRuntimeEntityBodies } from "../three/physics/runtime-entity-bodies";
import { PhysicsPoseBuffers } from "../three/physics/gpu-pose";
import { createEntityWorld } from "../world/runtime/entity-world";
import { reserveRigidBodySlots } from "../physics/runtime/rigid-body-slots";
import { createRigidSlotUpload } from "../physics/gpu/rigid-slot-upload";
import { DEFAULT_PHYSICS_WORLD_SETTINGS as settings } from "../physics/domain/world-settings";
import type { PhysicsPlaybackSolver } from "../three/physics/playback-backend";
import type { Runtime } from "../three/runtime";
import type { createRigidBodyCommands } from "../physics/gpu/rigid-body-commands";

it("bounds body slots, hidden-view uploads and draw groups across 10,000 physical lifetimes", async () => {
  let retiredViews = 0;
  for (let run = 0; run < 100; run++) {
    const descriptor = reserveRigidBodySlots({ bodies: [], gravity: [0, -9.81, 0], fixedTimestep: 1 / 60 }, 1);
    const upload = createRigidSlotUpload({ queue: { writeBuffer() {} } } as unknown as GPUDevice, descriptor,
      {} as GPUBuffer, {} as GPUBuffer, {} as GPUBuffer, [], { reset() {} } as unknown as ReturnType<typeof createRigidBodyCommands>);
    const poses = new PhysicsPoseBuffers(1);
    const service = createRuntimeEntityBodies({ runtime: { bodySlots: upload.port } as PhysicsPlaybackSolver,
      bodyBindings: descriptor.bodies.map((body) => body.binding), poseBuffers: poses }, settings, async () => undefined);
    const world = createEntityWorld({ capacity: 1, backend: service.backend });
    const view = { scene: new Scene(), disposed: false, framesSinceSceneChange: 0 } as Runtime;
    service.present(view); service.present(view);
    const groups = view.scene.children as Mesh<InstancedBufferGeometry>[];
    expect(groups.length).toBe(2);
    const releases = groups.map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    for (let cycle = 0; cycle < 100; cycle++) {
      const ticket = world.port.submit([{ op: "create", key: "body", name: "Body", primitive: {
        shape: { kind: "box", size: [1, 1, 1] }, position: [0, 2, 0], color: "#ffb020", mass: 1,
      } }]);
      world.flush(cycle * 2 + 1); upload.upload();
      const result = ticket.read(); if (result.status !== "committed") throw new Error("Spawn failed");
      expect(upload.port.activeCount()).toBe(1);
      world.port.submit([{ op: "destroy", handle: result.created.body }]); world.flush(cycle * 2 + 2); upload.upload();
      // Drain the controlled retirement chain; no wall-clock sleeps or GPU waits.
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      expect(world.port.stats()).toMatchObject({ alive: 0, allocatedSlots: 1, retiring: 0, quarantined: 0 });
      expect(upload.port.activeCount()).toBe(0);
      expect(descriptor.bodies.length).toBe(1);
      for (const mesh of groups) for (const key of ["bodyScale", "bodyColor"]) {
        expect((mesh.geometry.getAttribute(key) as InstancedBufferAttribute).updateRanges.length).toBeLessThanOrEqual(1);
      }
    }
    world.dispose(); service.dispose(); upload.dispose();
    expect(view.scene.children.length).toBe(0);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    releases.forEach((release) => { expect(release).toHaveBeenCalledOnce(); retiredViews++; });
  }
  expect(retiredViews).toBe(200);
});
