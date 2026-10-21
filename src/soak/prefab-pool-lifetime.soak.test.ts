import { expect, it } from "vitest";
import { prefabRuntimeFixture } from "../prefabs/testing/prefab-runtime-fixture";

it("reuses bounded prefab storage for 10,000 leases across 100 worlds", async () => {
  for (let run = 0; run < 100; run++) {
    const h = prefabRuntimeFixture(2), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
    for (let cycle = 0; cycle < 100; cycle++) {
      const ticket = pool.acquire({ position: [cycle % 3, 5, 0] }); h.world.flush(cycle * 2 + 1); h.upload.upload();
      const result = ticket.read(); if (result.status !== "committed") throw Error(JSON.stringify(result));
      expect(result.instance.root.generation).toBe(cycle + 1);
      pool.release(result.instance); h.world.flush(cycle * 2 + 2); h.upload.upload();
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      expect(pool.stats()).toMatchObject({ available: 1, retained: 1, reuses: cycle });
      expect(h.world.port.stats()).toMatchObject({ allocatedSlots: 4, reserved: 4, dormant: 4, runtime: 0 });
      expect(h.upload.port.activeCount()).toBe(0); expect(h.view.scene.children).toHaveLength(2);
      for (const mesh of h.view.scene.children) {
        const attributes = (mesh as import("three").Mesh).geometry.attributes;
        for (const name of ["bodyScale", "bodyColor", "bodyLocalOffset"]) expect((attributes[name] as import("three").BufferAttribute).updateRanges.length).toBeLessThanOrEqual(2);
      }
    }
    pool.dispose(); expect(h.world.port.stats().reserved).toBe(0); h.dispose();
  }
});
