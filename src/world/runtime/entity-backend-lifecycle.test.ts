import { expect, it, vi } from "vitest";
import type { EntityBatch, EntityHandle } from "../domain/entity-world";
import { createEntityWorld, type EntityLifecycleBackend, type PreparedEntityChange } from "./entity-world";

const creation = [{ op: "create" as const, key: "item", name: "Item" }];
const prepared = (): PreparedEntityChange => ({ publish: vi.fn(), rollback: vi.fn(), retire: vi.fn() });
const backend = (prepare: EntityLifecycleBackend["prepare"]): EntityLifecycleBackend => ({ components: [], prepare, dispose: vi.fn() });
const handle = (batch: EntityBatch): EntityHandle => {
  const state = batch.read(); if (state.status !== "committed") throw new Error("Expected commit");
  return state.created.item;
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it("validates component dependencies before allocation/publication and rejects registry cycles", () => {
  const prepare = vi.fn(prepared), components = [{ id: "test.pose", requires: [] }, { id: "test.body", requires: ["test.pose"] }];
  const world = createEntityWorld({ backend: { ...backend(prepare), components } });
  const invalid = world.port.submit([{ ...creation[0], components: ["test.body"] }]); world.flush(1);
  expect(invalid.read()).toMatchObject({ code: "missing-dependency" }); expect(prepare).not.toHaveBeenCalled();
  const valid = world.port.submit([{ ...creation[0], components: ["test.pose", "test.body"] }]); world.flush(2);
  expect(valid.read().status).toBe("committed"); expect(prepare).toHaveBeenCalledOnce(); world.dispose();
  expect(() => createEntityWorld({ backend: { ...backend(prepare), components: [
    { id: "a", requires: ["b"] }, { id: "b", requires: ["a"] },
  ] } })).toThrow(/cycle/);
  expect(() => createEntityWorld({ backend: { ...backend(prepare), components: [{ id: "a", requires: ["missing"] }] } })).toThrow(/dependency/);
});

it("holds async preparations invisible, preserves FIFO and publishes only at a later fixed tick", async () => {
  const pending = deferred<PreparedEntityChange>(), change = prepared();
  const world = createEntityWorld({ backend: backend(() => pending.promise) });
  const first = world.port.submit(creation), second = world.port.submit(creation);
  world.flush(1); world.flush(2);
  expect(first.read().status).toBe("preparing"); expect(second.read().status).toBe("queued");
  expect(world.port.stats().alive).toBe(0);
  pending.resolve(change); await pending.promise;
  expect(first.read().status).toBe("ready"); expect(change.publish).not.toHaveBeenCalled();
  world.flush(3); expect(first.read()).toMatchObject({ status: "committed", tick: 3 });
  expect(change.publish).toHaveBeenCalledOnce(); world.dispose(); expect(second.read()).toMatchObject({ code: "world-ended" });
});

it("disposes a late preparation after Stop and never publishes it into a new world", async () => {
  const pending = deferred<PreparedEntityChange>(), change = prepared();
  let signal!: AbortSignal;
  const adapter = backend((_, value) => { signal = value; return pending.promise; });
  const world = createEntityWorld({ backend: adapter });
  const receipt = world.port.submit(creation); world.flush(1); world.dispose(); world.dispose();
  expect(signal.aborted).toBe(true); expect(adapter.dispose).toHaveBeenCalledOnce();
  pending.resolve(change); await pending.promise;
  expect(change.publish).not.toHaveBeenCalled(); expect(change.rollback).toHaveBeenCalledOnce();
  expect(receipt.read()).toMatchObject({ code: "world-ended" }); expect(world.port.stats().alive).toBe(0);
});

it("releases reserved slots after preparation fails and after partial publication rolls back", async () => {
  const pending = deferred<PreparedEntityChange>();
  const prepare = vi.fn<EntityLifecycleBackend["prepare"]>().mockImplementationOnce(() => pending.promise);
  let published = 0;
  const rollback = vi.fn(() => { published = 0; });
  prepare.mockImplementationOnce(() => ({ publish() { published++; throw new Error("publish failed"); }, rollback, retire() {} }));
  prepare.mockImplementation(prepared);
  const world = createEntityWorld({ capacity: 1, backend: backend(prepare) });
  const first = world.port.submit(creation); world.flush(1); pending.reject(new Error("prepare failed"));
  await pending.promise.catch(() => undefined); await Promise.resolve(); world.flush(2);
  expect(first.read()).toMatchObject({ code: "backend-failed", message: "prepare failed" });
  const second = world.port.submit(creation); world.flush(3);
  expect(second.read()).toMatchObject({ code: "backend-failed", message: "publish failed" });
  expect(published).toBe(0); expect(rollback).toHaveBeenCalledOnce();
  const third = world.port.submit(creation); world.flush(4);
  expect(third.read().status).toBe("committed"); expect(world.port.stats().allocatedSlots).toBe(1); world.dispose();
});

it.each([true, false])("keeps removed slots fenced until retirement settles (success=%s)", async (succeeded) => {
  const pending = deferred<void>(), report = vi.fn();
  const world = createEntityWorld({ capacity: 1, report, backend: backend((plan) => ({
    ...prepared(), retire: () => plan.removed.length ? pending.promise : undefined,
  })) });
  const created = world.port.submit(creation); world.flush(1); const old = handle(created);
  world.port.submit([{ op: "destroy", handle: old }]); world.flush(2);
  expect(world.port.isAlive(old)).toBe(false); expect(world.port.stats().retiring).toBe(1);
  const early = world.port.submit(creation); world.flush(3); expect(early.read()).toMatchObject({ code: "capacity" });
  if (succeeded) pending.resolve(); else pending.reject(new Error("device lost"));
  await pending.promise.catch(() => undefined);
  expect(world.port.stats()).toMatchObject({ retiring: 0, quarantined: succeeded ? 0 : 1 });
  const next = world.port.submit(creation); world.flush(4);
  if (succeeded) {
    expect(handle(next).slot).toBe(old.slot); expect(handle(next).generation).toBeGreaterThan(old.generation);
  } else {
    expect(next.read()).toMatchObject({ code: "capacity" }); expect(report).toHaveBeenCalledOnce();
  }
  world.dispose();
});

it("fails closed if a backend cannot undo partial publication", () => {
  const report = vi.fn(), adapter = backend(() => ({
    publish() { throw new Error("publish"); }, rollback() { throw new Error("rollback"); }, retire() {},
  }));
  const world = createEntityWorld({ backend: adapter, report }); world.port.submit(creation); world.flush(1);
  expect(world.port.stats().ended).toBe(true); expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledOnce();
});

it("rolls back a ready preparation at Stop and isolates observer/cleanup failures", async () => {
  const pending = deferred<PreparedEntityChange>(), change = prepared();
  const adapter = { ...backend(() => pending.promise), dispose: () => Promise.reject(new Error("cleanup")) };
  const world = createEntityWorld({ backend: adapter, report() { throw new Error("observer"); } });
  world.port.submit(creation); world.flush(1); pending.resolve(change); await pending.promise;
  world.dispose(); await Promise.resolve();
  expect(change.rollback).toHaveBeenCalledOnce(); expect(change.publish).not.toHaveBeenCalled();
  expect(world.port.stats()).toMatchObject({ ended: true, queuedCommands: 0 });
});

it("notifies committed creation once after all nodes are live, without rolling back observer failures", () => {
  const report = vi.fn(), change = prepared();
  const observed: string[] = [];
  const world = createEntityWorld({ backend: backend(() => change), report, onCommitted(created) {
    expect(created).toHaveLength(2);
    for (const { entity } of created) { expect(world.port.isAlive(entity.handle)).toBe(true); observed.push(entity.name); }
    throw Error("observer failed");
  } });
  const receipt = world.port.submit([creation[0], { op: "create", key: "child", name: "Child", parentKey: "item" }]);
  world.flush(1); world.flush(2);
  expect(receipt.read()).toMatchObject({ status: "committed" }); expect(observed).toEqual(["Item", "Child"]);
  expect(world.port.stats().runtime).toBe(2); expect(change.rollback).not.toHaveBeenCalled(); expect(change.retire).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: "observer failed" })); world.dispose();
});
