import { expect, it, vi } from "vitest";
import { createEntityWorld, type EntityLifecycleBackend } from "./entity-world";

const authored = [
  { id: "child", name: "Child", parentId: "root", tags: ["Target"] },
  { id: "root", name: "Root", tags: ["Target"] },
  { id: "other", name: "Other", tags: ["Target"] },
];
function backend(): EntityLifecycleBackend {
  return { components: [], supportsAuthoredRemoval: true,
    prepare: vi.fn(() => ({ publish() {}, rollback() {}, retire() {} })), dispose() {} };
}

it("captures unordered authored hierarchy and destroys only the selected subtree at a fixed tick", () => {
  const service = backend(), world = createEntityWorld({ authored, backend: service });
  const root = world.port.findByAuthoredId("root")!, child = world.port.findByAuthoredId("child")!;
  expect(world.port.inspect(child).parent).toEqual(root);
  const ticket = world.port.destroy(root);
  expect(world.port.stats().alive).toBe(3); expect(ticket.read().status).toBe("queued");
  world.flush(1);
  expect(ticket.read()).toMatchObject({ status: "committed", tick: 1, removed: 2 });
  expect(world.port.findByAuthoredId("root")).toBeUndefined(); expect(world.port.findByAuthoredId("child")).toBeUndefined();
  expect(world.port.isAlive(root)).toBe(false); expect(() => world.port.inspect(child)).toThrow(/stale/);
  expect(world.port.queryTag("Target", 16).handles.map((handle) => world.port.inspect(handle).name)).toEqual(["Other"]);
  const stale = world.port.destroy(root); world.flush(2); expect(stale.read()).toMatchObject({ code: "stale-handle" });
  expect(service.prepare).toHaveBeenCalledTimes(1);
  world.dispose();
  const replay = createEntityWorld({ authored, backend: backend() });
  expect(replay.port.stats().alive).toBe(3); expect(replay.port.isAlive(root)).toBe(false); replay.dispose();
});

it("rejects unsupported backends, partial parent removal and mixed retag/destruction without side effects", () => {
  const unsupported = createEntityWorld({ authored });
  const denied = unsupported.port.destroy(unsupported.port.findByAuthoredId("root")!); unsupported.flush(1);
  expect(denied.read()).toMatchObject({ code: "authored-entity" }); unsupported.dispose();
  const service = backend(), world = createEntityWorld({ authored, backend: service });
  const root = world.port.findByAuthoredId("root")!, child = world.port.findByAuthoredId("child")!;
  const partial = world.port.submit([{ op: "destroy", handle: root }]); world.flush(1);
  expect(partial.read()).toMatchObject({ code: "invalid-command" });
  const conflict = world.port.submit([{ op: "destroySubtree", handle: root }, { op: "setTags", handle: child, tags: [] }]); world.flush(2);
  expect(conflict.read()).toMatchObject({ code: "invalid-command" }); expect(service.prepare).not.toHaveBeenCalled();
  expect(world.port.stats()).toMatchObject({ alive: 3, tagMemberships: 3 }); world.dispose();
});

it("bounds descendant expansion before preparation and accepts exactly 128 nodes", () => {
  for (const count of [128, 129, 10_000]) {
    const service = backend();
    const world = createEntityWorld({ capacity: count + 1, backend: service,
      authored: Array.from({ length: count }, (_, index) => ({ id: String(index), name: String(index), parentId: index ? "0" : undefined })) });
    const receipt = world.port.destroy(world.port.findByAuthoredId("0")!); world.flush(1);
    expect(receipt.read()).toMatchObject(count === 128 ? { status: "committed", removed: 128 } : { status: "rejected", code: "capacity" });
    expect(world.port.stats().alive).toBe(count === 128 ? 0 : count); world.dispose();
  }
});

it("rolls back failed publication and prevents early identity reuse while resources retire", async () => {
  let finish!: () => void;
  const retirement = new Promise<void>((resolve) => { finish = resolve; });
  const rollback = vi.fn(); let fail = true;
  const world = createEntityWorld({ authored, backend: { ...backend(),
    prepare: () => ({ publish() { if (fail) throw new Error("publication failed"); }, rollback, retire: () => retirement }) } });
  const root = world.port.findByAuthoredId("root")!;
  const rejected = world.port.destroy(root); world.flush(1);
  expect(rejected.read()).toMatchObject({ code: "backend-failed" }); expect(rollback).toHaveBeenCalledTimes(1);
  expect(world.port.stats().alive).toBe(3); fail = false;
  world.port.destroy(root); world.flush(2); expect(world.port.stats().retiring).toBe(2);
  finish(); await retirement; await Promise.resolve(); expect(world.port.stats().retiring).toBe(0); world.dispose();
});

it("rejects invalid captured parent graphs without recursive stack growth", () => {
  expect(() => createEntityWorld({ authored: [{ id: "a", name: "a", parentId: "b" }] })).toThrow(/acyclic/);
  expect(() => createEntityWorld({ authored: [{ id: "a", name: "a", parentId: "b" }, { id: "b", name: "b", parentId: "a" }] })).toThrow(/acyclic/);
});
