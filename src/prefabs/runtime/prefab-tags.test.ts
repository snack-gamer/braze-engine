import { expect, it, vi } from "vitest";
import { prefabRuntimeFixture } from "../testing/prefab-runtime-fixture";
import type { PrefabBatch } from "../domain/runtime-prefab";

const instance = (ticket: PrefabBatch) => {
  const state = ticket.read(); if (state.status !== "committed") throw Error(JSON.stringify(state)); return state.instance;
};
it("resets tags on pooled reuse, excludes dormant members and does not inherit parent tags", async () => {
  const h = prefabRuntimeFixture(), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
  const a = pool.acquire(); h.world.flush(1); const first = instance(a);
  expect(h.world.port.queryTag("Reusable", 16).handles).toEqual([first.root]);
  const prepare = vi.spyOn(h.service.backend, "prepare");
  h.world.port.submit([{ op: "setTags", handle: first.root, tags: ["Temporary"] }]); h.world.flush(2);
  expect(prepare).not.toHaveBeenCalled(); expect(h.world.port.queryTag("Reusable", 16).total).toBe(0);
  pool.release(first); h.world.flush(3);
  expect(h.world.port.queryTag("Temporary", 16).total).toBe(0); expect(h.world.port.stats().tagMemberships).toBe(0);
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  const b = pool.acquire(); h.world.flush(4); const second = instance(b);
  expect(second.root.slot).toBe(first.root.slot); expect(second.root.generation).toBeGreaterThan(first.root.generation);
  expect(h.world.port.queryTag("Reusable", 16).handles).toEqual([second.root]); expect(h.world.port.queryTag("Temporary", 16).total).toBe(0);
  h.dispose(); expect(h.world.port.stats()).toMatchObject({ tagKinds: 0, tagMemberships: 0 });
});
