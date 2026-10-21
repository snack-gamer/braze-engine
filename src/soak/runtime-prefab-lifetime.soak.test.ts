import { expect, it, vi } from "vitest";
import type { Mesh, InstancedBufferGeometry, InstancedBufferAttribute } from "three";
import { prefabRuntimeFixture } from "../prefabs/testing/prefab-runtime-fixture";
import type { PrefabInstance } from "../prefabs/domain/runtime-prefab";

it("retires 10,000 prefab graphs without accumulating entities, body slots or hidden-view ranges", async () => {
  let previous: PrefabInstance | undefined;
  for (let run = 0; run < 100; run++) {
    const h = prefabRuntimeFixture(), groups = h.view.scene.children as Mesh<InstancedBufferGeometry>[];
    const dispose = groups.map((group) => vi.spyOn(group.geometry, "dispose"));
    for (let cycle = 0; cycle < 100; cycle++) {
      const ticket = h.prefabs.instantiate(h.asset); h.world.flush(cycle * 2 + 1); h.upload.upload();
      const result = ticket.read(); if (result.status !== "committed") throw new Error("Prefab creation failed");
      if (previous) expect(h.prefabs.isAlive(previous)).toBe(false); previous = result.instance;
      expect(h.upload.port.activeCount()).toBe(2); expect(h.world.port.stats().alive).toBe(4);
      h.prefabs.destroy(result.instance); h.world.flush(cycle * 2 + 2); h.upload.upload();
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
      expect(h.world.port.stats()).toMatchObject({ alive: 0, allocatedSlots: 4, retiring: 0, quarantined: 0 });
      expect(h.upload.port.activeCount()).toBe(0); expect(h.descriptor.bodies.length).toBe(2);
      expect(h.view.scene.children.length).toBe(2);
      for (const mesh of groups) for (const key of ["bodyScale", "bodyColor", "bodyLocalOffset"]) {
        expect((mesh.geometry.getAttribute(key) as InstancedBufferAttribute).updateRanges.length).toBeLessThanOrEqual(2);
      }
    }
    h.dispose(); for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    expect(h.view.scene.children.length).toBe(0); dispose.forEach((release) => expect(release).toHaveBeenCalledOnce());
  }
});
