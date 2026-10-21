import { expect, it } from "vitest";
import { committed, modelRuntimeFixture, prefabAsset } from "../prefabs/testing/model-runtime-fixture";
it("reuses model resources across 1,000 leases without accumulating view graphs", async () => {
  for (let run = 0; run < 20; run++) {
    const h = modelRuntimeFixture(), pool = h.prefabs.createPool(prefabAsset, { capacity: 1 });
    for (let cycle = 0; cycle < 50; cycle++) {
      const ticket = pool.acquire(); await h.flush(cycle * 4 + 1);
      expect(h.view.scene.children).toHaveLength(1);
      pool.release(committed(ticket)); await h.flush(cycle * 4 + 3);
      expect(h.view.scene.children).toHaveLength(0);
      expect(pool.stats()).toMatchObject({ available: 1, retained: 1, reuses: cycle });
      expect(h.counts()).toEqual({ prepared: 1, released: 0 });
    }
    pool.dispose(); await h.dispose(); expect(h.counts()).toEqual({ prepared: 1, released: 1 });
  }
});
