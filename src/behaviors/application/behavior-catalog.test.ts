import { describe, expect, it, vi } from "vitest";
import type { BehaviorRegistration } from "../domain/behavior-registration";
import { createBehaviorCatalog } from "./behavior-catalog";

function definition(id = "test.counter"): BehaviorRegistration {
  return { id, label: "Counter", version: 1, fields: [], create: () => { throw new Error("Never instantiate during discovery"); } };
}
function pending() {
  let resolve!: (value: readonly BehaviorRegistration[]) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<readonly BehaviorRegistration[]>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("editor behavior catalog ownership", () => {
  it("validates a frozen snapshot without invoking behavior factories", async () => {
    const source = definition();
    const catalog = createBehaviorCatalog(async () => [source]);
    await catalog.reload();
    expect(catalog.read().status).toBe("ready");
    expect(catalog.read().definitions[0].id).toBe(source.id);
    expect(Object.isFrozen(catalog.read().definitions)).toBe(true);
    expect(catalog.read().definitions[0]).not.toBe(source);
  });

  it("ignores an older success and older failure after a reload", async () => {
    const old = pending(), fresh = pending();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const catalog = createBehaviorCatalog(load);
    const oldRequest = catalog.reload(), nextRequest = catalog.reload();
    fresh.resolve([definition("fresh")]); await nextRequest;
    old.resolve([definition("old")]); await oldRequest;
    expect(catalog.read().definitions[0].id).toBe("fresh");
    const delayedFailure = pending();
    load.mockReturnValueOnce(delayedFailure.promise).mockResolvedValueOnce([definition("newest")]);
    const failedRequest = catalog.reload(); await catalog.reload();
    delayedFailure.reject(new Error("stale failure")); await failedRequest;
    expect(catalog.read().definitions[0].id).toBe("newest");
  });

  it("invalidates unmounted loads and supports effect remount without polling", async () => {
    const old = pending();
    const catalog = createBehaviorCatalog(vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce([]));
    const listener = vi.fn(), unsubscribe = catalog.subscribe(listener);
    const request = catalog.reload();
    catalog.cancel(); unsubscribe();
    old.resolve([definition()]); await request;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(catalog.read().status).toBe("loading");
    await catalog.reload();
    expect(catalog.read()).toEqual({ status: "ready", definitions: [] });
  });

  it("reports failed or invalid catalogs and retries without treating old definitions as current", async () => {
    const load = vi.fn().mockResolvedValueOnce([definition()]).mockRejectedValueOnce(new Error("source unavailable"))
      .mockResolvedValueOnce([definition(), definition()]).mockResolvedValueOnce([definition("recovered")]);
    const catalog = createBehaviorCatalog(load);
    await catalog.reload(); await catalog.reload();
    expect(catalog.read()).toMatchObject({ status: "failed", definitions: [], message: "source unavailable" });
    await catalog.reload();
    expect(catalog.read().message).toContain("duplicate");
    await catalog.reload();
    expect(catalog.read().definitions[0].id).toBe("recovered");
  });
});
