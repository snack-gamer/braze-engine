import { expect, it, vi } from "vitest";
import { prefabRuntimeFixture } from "../../prefabs/testing/prefab-runtime-fixture";
import type { PrefabBatch } from "../../prefabs/domain/runtime-prefab";
import { createEntityBehaviors } from "./entity-behaviors";
import type { EntityBehaviorScope } from "../domain/entity-behaviors";

const tick = (index: number) => ({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 });
const lease = (batch: PrefabBatch) => { const state = batch.read(); if (state.status !== "committed") throw Error("No lease"); return state.instance; };
it("ends behaviors at pool return publication before GPU retirement, then allows fresh lease state", async () => {
  let retire!: () => void; const fence = new Promise<void>((resolve) => { retire = resolve; });
  const h = prefabRuntimeFixture(2, () => fence), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
  const host = createEntityBehaviors({ world: h.world.port, report: vi.fn() }), counts: number[] = [], dispose = vi.fn();
  const scopes: EntityBehaviorScope[] = [], definition = { name: "Lease counter", create(scope: EntityBehaviorScope) {
    scopes.push(scope); let count = 0; return { fixedUpdate() { counts.push(++count); }, dispose };
  } };
  const firstTicket = pool.acquire(); h.world.flush(1); const first = lease(firstTicket);
  const attachment = host.port.attach(first.root, definition); host.beginTick(tick(1)); host.fixedUpdate(tick(1));
  const never = vi.fn(), pending = host.port.attach(first.entities.box, { name: "Never starts", create: never });
  pool.release(first); h.world.flush(2); host.beginTick(tick(2)); host.fixedUpdate(tick(2));
  expect(h.world.port.stats().retiring).toBe(4); expect(dispose).toHaveBeenCalledExactlyOnceWith("entity-removed");
  expect(scopes[0].signal.aborted).toBe(true); expect(attachment.read().reason).toBe("entity-removed");
  expect(never).not.toHaveBeenCalled(); expect(pending.read().reason).toBe("entity-removed");
  expect(() => host.port.attach(first.root, definition)).toThrow(/stale/); expect(counts).toEqual([1]);
  retire(); for (let i = 0; i < 12; i++) await Promise.resolve();
  const nextTicket = pool.acquire(); h.world.flush(3); const next = lease(nextTicket);
  expect(next.root.slot).toBe(first.root.slot); expect(next.root.generation).toBeGreaterThan(first.root.generation);
  host.port.attach(next.root, definition); host.beginTick(tick(3)); host.fixedUpdate(tick(3));
  expect(counts).toEqual([1, 1]); expect(scopes[1].signal.aborted).toBe(false);
  expect(() => attachment.setEnabled(true)).toThrow(/ended/);
  host.dispose(); h.dispose(); expect(scopes[1].signal.aborted).toBe(true); expect(dispose).toHaveBeenCalledTimes(2);
});
