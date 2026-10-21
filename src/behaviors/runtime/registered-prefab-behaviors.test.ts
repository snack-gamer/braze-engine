import { expect, it, vi } from "vitest";
import type { EntityHandle } from "../../world/domain/entity-world";
import type { BehaviorRegistration, RegisteredBehaviorScope } from "../domain/behavior-registration";
import { behaviorAsset, behaviorPrefab, registeredBehaviorFixture, savedBehavior } from "../testing/registered-behavior-fixture";
import { makeObject } from "../../lib/payload";

it("activates unread prefab tickets at publication and resolves only the current instance's nodes", async () => {
  const pairs: { root: EntityHandle; target: EntityHandle | undefined }[] = [];
  const h = registeredBehaviorFixture({ objects: [makeObject("cube", 0, { id: "child" })], prefabs: [behaviorPrefab()], registrations: [{
    id: "demo.counter", label: "Counter", version: 1, fields: [{ key: "target", label: "Target", kind: "entity", default: null }],
    create(scope, values) { pairs.push({ root: scope.entity, target: scope.resolveEntity(values.target as { entityId: string }) }); return { dispose() {} }; },
  }] });
  await h.session.start();
  h.context().prefabs.instantiate(behaviorAsset); h.context().prefabs.instantiate(behaviorAsset);
  h.session.step(); expect(pairs).toHaveLength(1); h.session.step(); expect(pairs).toHaveLength(2);
  expect(pairs.every((pair) => pair.target && h.context().world.inspect(pair.target).parent === pair.root)).toBe(true);
  expect(pairs[0].target).not.toEqual(pairs[1].target);
  expect(pairs.every((pair) => pair.target !== h.context().world.findByAuthoredId("child"))).toBe(true);
  expect(h.diagnostics).toEqual([]); h.session.dispose();
});

it("automatically restores saved values with fresh factories and handles after pool return", async () => {
  const counts: number[] = [], scopes: RegisteredBehaviorScope[] = [], targets: EntityHandle[] = [];
  const disposals = vi.fn(), cleanups = vi.fn();
  const h = registeredBehaviorFixture({ objects: [], prefabs: [behaviorPrefab()], registrations: [{
    id: "demo.counter", label: "Counter", version: 1, fields: [{ key: "target", label: "Target", kind: "entity", default: null }],
    create(scope, values) {
      scopes.push(scope); targets.push(scope.resolveEntity(values.target as { entityId: string })!); scope.defer(cleanups);
      let count = 0; return { fixedUpdate() { counts.push(++count); }, dispose: disposals };
    },
  }] });
  await h.session.start(); const pool = h.context().prefabs.createPool(behaviorAsset, { capacity: 1 });
  const firstTicket = pool.acquire(); h.session.step();
  expect(counts).toEqual([1]); // The receipt was never read by activation.
  const first = firstTicket.read(); if (first.status !== "committed") throw Error("No first lease");
  pool.release(first.instance); h.session.step();
  expect(disposals).toHaveBeenCalledExactlyOnceWith("entity-removed"); expect(cleanups).toHaveBeenCalledOnce();
  expect(scopes[0].signal.aborted).toBe(true); expect(scopes[0].resolveEntity({ entityId: "child" })).toBeUndefined();
  expect(h.context().behaviors.stats()).toMatchObject({ attached: 0, pending: 0 });
  pool.acquire(); h.session.step(); expect(counts).toEqual([1, 1]);
  expect(scopes[1].entity.slot).toBe(scopes[0].entity.slot);
  expect(scopes[1].entity.generation).toBeGreaterThan(scopes[0].entity.generation);
  expect(targets[1].generation).toBeGreaterThan(targets[0].generation);
  h.session.dispose(); expect(disposals).toHaveBeenCalledTimes(2); expect(cleanups).toHaveBeenCalledTimes(2);
});

it("rejects external prefab references locally even if a matching scene entity exists", async () => {
  const create = vi.fn();
  const h = registeredBehaviorFixture({ objects: [makeObject("cube", 0, { id: "outside" })],
    prefabs: [behaviorPrefab(savedBehavior("counter", { target: { entityId: "outside" } }))], registrations: [{
      id: "demo.counter", label: "Counter", version: 1, fields: [{ key: "target", label: "Target", kind: "entity", default: null }], create,
    }],
  });
  await h.session.start(); h.context().prefabs.instantiate(behaviorAsset); h.session.step();
  expect(create).not.toHaveBeenCalled(); expect(h.session.status()).toBe("running");
  expect(h.context().world.stats()).toMatchObject({ runtime: 2 });
  expect(h.diagnostics).toHaveLength(1); expect(h.diagnostics[0].message).toContain("outside its prefab instance");
  h.session.dispose();
});

it("reports excess saved attachments once while preserving the committed prefab and healthy behaviors", async () => {
  const update = vi.fn();
  const registration: BehaviorRegistration = { id: "demo.counter", label: "Counter", version: 1, fields: [], create: () => ({ fixedUpdate: update, dispose() {} }) };
  const objects = Array.from({ length: 32 }, (_, index) => makeObject("cube", index, { id: `owner${index}`, behaviors: {
    version: 1, entries: Array.from({ length: 8 }, (_, entry) => savedBehavior(`counter${entry}`).entries[0]),
  } }));
  const h = registeredBehaviorFixture({ registrations: [registration], objects, prefabs: [behaviorPrefab(savedBehavior())] });
  await h.session.start(); h.session.step(); expect(h.context().behaviors.stats().attached).toBe(256);
  h.context().prefabs.instantiate(behaviorAsset); h.session.step(); h.session.step();
  expect(h.context().world.stats().runtime).toBe(2); expect(h.session.status()).toBe("running");
  expect(h.diagnostics).toHaveLength(1); expect(h.diagnostics[0].message).toContain("capacity");
  expect(update).toHaveBeenCalledTimes(768); h.session.dispose();
});

it("activates a replacement at the same boundary using capacity freed by removed entities", async () => {
  const updates: string[] = [], disposals: string[] = [];
  const h = registeredBehaviorFixture({ objects: [], registrations: [{ id: "demo.counter", label: "Counter", version: 1, fields: [], create(scope) {
    const name = h.context().world.inspect(scope.entity).name;
    return { fixedUpdate() { updates.push(name); }, dispose() { disposals.push(name); } };
  } }] });
  await h.session.start();
  const component = { version: 1 as const, entries: Array.from({ length: 8 }, (_, entry) => savedBehavior(`entry${entry}`).entries[0]) };
  const first = h.context().world.submit(Array.from({ length: 32 }, (_, index) => ({ op: "create" as const, key: `${index}`, name: "Old", behaviors: component })));
  h.session.step(); expect(h.context().behaviors.stats().attached).toBe(256);
  const state = first.read(); if (state.status !== "committed") throw Error("No original entities");
  h.context().world.submit([
    ...Object.values(state.created).map((handle) => ({ op: "destroy" as const, handle })),
    ...Array.from({ length: 32 }, (_, index) => ({ op: "create" as const, key: `${index}`, name: "New", behaviors: component })),
  ]);
  h.session.step(); expect(h.context().behaviors.stats()).toMatchObject({ attached: 256, pending: 0 });
  expect(disposals).toHaveLength(256); expect(updates.filter((name) => name === "New")).toHaveLength(256);
  expect(h.diagnostics).toEqual([]); h.session.dispose();
});
