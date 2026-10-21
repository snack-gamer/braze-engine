import { describe, expect, it } from "vitest";
import { LeasedResourceCache } from "../three/resources/leased-resource-cache";

type TestResource = Readonly<{
  serial: number;
  key: string;
}>;

describe("LeasedResourceCache deterministic soak", () => {
  it("keeps high-churn idle state bounded and disposes every resource exactly once", () => {
    const maxIdleEntries = 11;
    const maxIdleBytes = 96;
    const churnCount = 20_000;
    let nextSerial = 1;
    let failedLoads = 0;
    const created = new Map<number, TestResource>();
    const disposalCounts = new Map<number, number>();
    const create = (key: string): TestResource => {
      const resource = { serial: nextSerial++, key };
      created.set(resource.serial, resource);
      return resource;
    };
    const cache = new LeasedResourceCache<TestResource>({
      maxIdleEntries,
      maxIdleBytes,
      dispose: (resource) => {
        disposalCounts.set(resource.serial, (disposalCounts.get(resource.serial) ?? 0) + 1);
      },
    });

    const activeLeases = Array.from({ length: 32 }, (_, index) => {
      const key = `active-${index}`;
      const lease = cache.acquire(key, () => create(key));
      cache.updateEstimatedBytes(key, lease.value, 24);
      return lease;
    });

    for (let index = 0; index < churnCount; index += 1) {
      const key = `transient-${index % 257}`;
      const first = cache.acquire(key, () => create(key));
      const second = cache.acquire(key, () => create(key));
      expect(second.value).toBe(first.value);
      cache.updateEstimatedBytes(key, first.value, 8 + (index % 3) * 8);
      first.release();
      first.release();
      second.release();

      if (index % 211 === 0) {
        const failedKey = `failed-${index}`;
        const failed = cache.acquire(failedKey, () => create(failedKey));
        expect(cache.invalidate(failedKey, failed.value, "failed")).toBe(true);
        failedLoads += 1;
        const retry = cache.acquire(failedKey, () => create(failedKey));
        expect(retry.value).not.toBe(failed.value);
        failed.release();
        retry.release();
      }

      if (index % 100 !== 0) continue;
      const diagnostics = cache.diagnostics();
      expect(diagnostics.activeEntries).toBe(32);
      expect(diagnostics.references).toBe(32);
      expect(diagnostics.idleEntries).toBeLessThanOrEqual(maxIdleEntries);
      expect(diagnostics.idleEstimatedBytes).toBeLessThanOrEqual(maxIdleBytes);
    }

    for (const lease of activeLeases.reverse()) lease.release();
    const bounded = cache.diagnostics();
    expect(bounded.activeEntries).toBe(0);
    expect(bounded.references).toBe(0);
    expect(bounded.idleEntries).toBeLessThanOrEqual(maxIdleEntries);
    expect(bounded.idleEstimatedBytes).toBeLessThanOrEqual(maxIdleBytes);
    expect(bounded.failedLoads).toBe(failedLoads);

    cache.clearUnused();
    cache.clearUnused();
    expect(cache.diagnostics()).toMatchObject({
      entries: 0,
      activeEntries: 0,
      idleEntries: 0,
      references: 0,
      estimatedBytes: 0,
      idleEstimatedBytes: 0,
    });
    expect(disposalCounts.size).toBe(created.size);
    expect([...disposalCounts.values()].every((count) => count === 1)).toBe(true);
  });
});
