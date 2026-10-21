import { expect, it, vi } from "vitest";
import { prefabRuntimeFixture } from "../testing/prefab-runtime-fixture";
import type { PrefabBatch, PrefabInstance } from "../domain/runtime-prefab";
const lease = (batch: PrefabBatch): PrefabInstance => { const result = batch.read(); if (result.status !== "committed") throw Error(JSON.stringify(result)); return result.instance; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

it("retains logical and physical slots, isolates ownership and issues fresh handles on reuse", async () => {
  const h = prefabRuntimeFixture(2), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
  expect(pool.stats()).toMatchObject({ available: 1, retained: 0 });
  const first = pool.acquire({ position: [0, 5, 0] }); expect(pool.stats().pending).toBe(1);
  expect(() => pool.acquire()).toThrow(/exhausted/); expect(() => pool.dispose()).toThrow(/pending/);
  h.world.flush(1); const a = lease(first); h.upload.upload();
  expect(pool.isAlive(a)).toBe(true); expect(() => pool.release({ ...a })).toThrow(/stale/);
  const direct = h.world.port.submit([{ op: "destroy", handle: a.entities.box }]); h.world.flush(2);
  expect(direct.read()).toMatchObject({ code: "invalid-command" }); expect(pool.isAlive(a)).toBe(true);
  const returned = pool.release(a); expect(() => pool.release(a)).toThrow(/already returning/);
  expect(pool.isAlive(a)).toBe(true); h.world.flush(3); h.upload.upload();
  expect(returned.read().status).toBe("committed"); expect(pool.isAlive(a)).toBe(false);
  await settle(); expect(pool.stats()).toMatchObject({ available: 1, active: 0, retained: 1 });
  expect(h.world.port.stats()).toMatchObject({ runtime: 0, dormant: 4, reserved: 4, allocatedSlots: 4 });
  // A normal spawn cannot steal the pool's retained GPU reservation.
  const outsider = h.prefabs.instantiate(h.asset); h.world.flush(4); expect(outsider.read()).toMatchObject({ code: "capacity" });
  const second = pool.acquire({ position: [4, 8, 0], rotation: [0, 90, 0] }); h.world.flush(5); const b = lease(second); h.upload.upload();
  expect(b.root.slot).toBe(a.root.slot); expect(b.root.generation).toBeGreaterThan(a.root.generation);
  expect(b.entities.box.slot).toBe(a.entities.box.slot); expect(h.world.port.inspect(b.entities.box).parent).toBe(b.entities.group);
  expect(h.upload.port.generation(0)).toBe(2); expect(h.upload.port.generation(1)).toBe(2);
  expect(h.descriptor.bodies[0].position[1]).toBeCloseTo(8.2);
  expect(pool.stats()).toMatchObject({ active: 1, acquisitions: 2, reuses: 1 });
  expect(() => pool.release(a)).toThrow(/stale/); expect(first.read()).toMatchObject({ instance: a });
  pool.release(b); h.world.flush(6); h.upload.upload(); await settle(); pool.dispose(); pool.dispose();
  expect(h.world.port.stats()).toMatchObject({ dormant: 0, reserved: 0 });
  const unpooled = h.prefabs.instantiate(h.asset); h.world.flush(7); expect(unpooled.read().status).toBe("committed");
  expect(() => pool.acquire()).toThrow(/disposed/); h.dispose();
});

it("waits for the entire retirement fence before reuse and cleans up on Stop", async () => {
  let finish!: () => void; const fence = new Promise<void>((done) => { finish = done; });
  const h = prefabRuntimeFixture(2, () => fence), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
  const first = pool.acquire(); h.world.flush(1); const a = lease(first);
  pool.release(a); h.world.flush(2); await settle();
  expect(pool.stats()).toMatchObject({ available: 0, pending: 1 }); expect(() => pool.acquire()).toThrow(/exhausted/);
  expect(() => pool.dispose()).toThrow(/retirement/); expect(h.world.port.stats().retiring).toBe(4);
  finish(); await settle(); expect(pool.stats().available).toBe(1);
  const queued = pool.acquire(); h.dispose(); expect(queued.read()).toMatchObject({ code: "world-ended" });
  expect(pool.stats()).toMatchObject({ active: 0, pending: 0, retained: 0, ended: true });
  expect(() => pool.acquire()).toThrow(/ended/); pool.dispose();
});

it("restores a failed acquisition without partial publication and bounds reservations", () => {
  const h = prefabRuntimeFixture(1), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
  const failed = pool.acquire(); h.world.flush(1); expect(failed.read()).toMatchObject({ code: "capacity" });
  expect(pool.stats()).toMatchObject({ available: 1, retained: 0 });
  expect(h.world.port.stats()).toMatchObject({ reserved: 0, dormant: 0, runtime: 0 });
  expect(() => pool.acquire({ scale: [1, 2, 1] })).toThrow(/uniform/); expect(pool.stats().available).toBe(1);
  expect(() => h.prefabs.createPool(h.asset, { capacity: 0 })).toThrow(/1–64/);
  expect(() => h.prefabs.createPool(h.asset, { capacity: 65 })).toThrow(/1–64/);
  const second = h.prefabs.createPool(h.asset, { capacity: 1 }); expect(() => second.release({} as PrefabInstance)).toThrow(/stale/);
  pool.dispose(); second.dispose(); h.dispose();
});

it("keeps different pools independent and restores a failed physical reuse publication", async () => {
  const h = prefabRuntimeFixture(4), a = h.prefabs.createPool(h.asset, { capacity: 1 }), b = h.prefabs.createPool(h.asset, { capacity: 1 });
  const first = a.acquire(); h.world.flush(1); const original = lease(first);
  const other = b.acquire(); h.world.flush(2); const neighbor = lease(other);
  expect(() => b.release(original)).toThrow(/another pool/);
  a.release(original); h.world.flush(3); await settle();
  expect(a.stats().available).toBe(1); expect(b.isAlive(neighbor)).toBe(true);
  const prepare = h.service.backend.prepare;
  const spy = vi.spyOn(h.service.backend, "prepare").mockImplementationOnce((plan, signal) => {
    const prepared = prepare(plan, signal);
    if ("then" in prepared) throw Error("Expected synchronous physical preparation");
    return { ...prepared, publish() { prepared.publish(); throw Error("Controlled publication failure"); } };
  });
  const failed = a.acquire(); h.world.flush(4); expect(failed.read()).toMatchObject({ code: "backend-failed" }); spy.mockRestore();
  expect(a.stats().available).toBe(1); expect(b.isAlive(neighbor)).toBe(true); expect(h.upload.port.activeCount()).toBe(2);
  const recovered = a.acquire(); h.world.flush(5); expect(lease(recovered).root.slot).toBe(original.root.slot);
  expect(h.upload.port.activeCount()).toBe(4); h.dispose();
});

it("quarantines failed retirement instead of reusing unsafe physical storage", async () => {
  const h = prefabRuntimeFixture(2, () => Promise.reject(Error("Controlled fence failure"))), pool = h.prefabs.createPool(h.asset, { capacity: 1 });
  const ticket = pool.acquire(); h.world.flush(1); pool.release(lease(ticket)); h.world.flush(2); await settle();
  expect(pool.stats()).toMatchObject({ available: 0, quarantined: 1 });
  expect(h.world.port.stats()).toMatchObject({ quarantined: 4, dormant: 0 });
  expect(() => pool.acquire()).toThrow(/exhausted/); h.dispose(); pool.dispose();
});
