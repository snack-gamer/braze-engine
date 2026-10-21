import { describe, expect, it, vi } from "vitest";
import { LeasedResourceCache } from "./leased-resource-cache";

function cache(dispose = vi.fn<(value: { id: string }) => void>()) {
  return {
    dispose,
    value: new LeasedResourceCache<{ id: string }>({
      maxIdleEntries: 1,
      maxIdleBytes: 10,
      dispose,
    }),
  };
}

describe("LeasedResourceCache", () => {
  it("shares a value and never evicts it while any consumer retains it", () => {
    const { value, dispose } = cache();
    const create = vi.fn(() => ({ id: "shared" }));
    const scene = value.acquire("model", create);
    const game = value.acquire("model", create);

    expect(scene.value).toBe(game.value);
    expect(create).toHaveBeenCalledOnce();
    scene.release();
    value.clearUnused();
    expect(dispose).not.toHaveBeenCalled();

    game.release();
    value.clearUnused();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("evicts least-recently-used idle values to satisfy count and byte budgets", () => {
    const { value, dispose } = cache();
    const first = value.acquire("first", () => ({ id: "first" }));
    value.updateEstimatedBytes("first", first.value, 8);
    first.release();

    const second = value.acquire("second", () => ({ id: "second" }));
    value.updateEstimatedBytes("second", second.value, 8);
    second.release();

    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(first.value);
    expect(value.diagnostics()).toMatchObject({
      entries: 1,
      idleEntries: 1,
      idleEstimatedBytes: 8,
      evictions: 1,
    });
  });

  it("removes failed values from lookup but waits for their owners to release", () => {
    const { value, dispose } = cache();
    const failed = value.acquire("texture", () => ({ id: "failed" }));

    expect(value.invalidate("texture", failed.value, "failed")).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    const retry = value.acquire("texture", () => ({ id: "retry" }));
    expect(retry.value).not.toBe(failed.value);

    failed.release();
    expect(dispose).toHaveBeenCalledWith(failed.value);
    expect(value.diagnostics().failedLoads).toBe(1);
    retry.release();
  });

  it("disposes an asynchronous result that completes after its lease is evicted", async () => {
    let resolve!: (value: { id: string }) => void;
    const pending = new Promise<{ id: string }>((next) => { resolve = next; });
    const dispose = vi.fn<(value: { id: string }) => void>();
    const values = new LeasedResourceCache<Promise<{ id: string }>>({
      maxIdleEntries: 0,
      maxIdleBytes: 0,
      dispose: (promise) => void promise.then(dispose),
    });
    const lease = values.acquire("late", () => pending);

    lease.release();
    resolve({ id: "late" });
    await pending;
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledOnce();
    expect(values.diagnostics().entries).toBe(0);
  });
});
