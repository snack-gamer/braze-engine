import { expect, it } from "vitest";
import { behaviorAsset, behaviorPrefab, registeredBehaviorFixture } from "../behaviors/testing/registered-behavior-fixture";

it("reclaims 10,000 automatically activated saved prefab behavior lifetimes with constant pool slots", async () => {
  let creates = 0, starts = 0, updates = 0, cleanups = 0, disposals = 0, badScope = 0;
  const h = registeredBehaviorFixture({ objects: [], prefabs: [behaviorPrefab()], registrations: [{
    id: "demo.counter", label: "Counter", version: 1, fields: [{ key: "target", label: "Target", kind: "entity", default: null }],
    create(scope, values, context) {
      creates++; const target = scope.resolveEntity(values.target as { entityId: string });
      if (!target || context.world.inspect(target).parent !== scope.entity) badScope++;
      scope.defer(() => { cleanups++; if (!scope.signal.aborted) badScope++; });
      let ticks = 0;
      return { start() { starts++; }, fixedUpdate() { updates++; if (++ticks !== 1) badScope++; },
        dispose(reason) { disposals++; if (reason !== "entity-removed" || !scope.signal.aborted) badScope++; } };
    },
  }] });
  await h.session.start(); const pool = h.context().prefabs.createPool(behaviorAsset, { capacity: 1 });
  for (let cycle = 0; cycle < 10_000; cycle++) {
    const ticket = pool.acquire(); h.session.step();
    // No read is necessary for automatic activation. Read only to return this lease.
    if (creates !== cycle + 1 || updates !== cycle + 1) throw Error(`Missing activation ${cycle}`);
    const state = ticket.read(); if (state.status !== "committed") throw Error("No saved prefab instance");
    pool.release(state.instance); h.session.step();
    const stats = h.context().behaviors.stats();
    if (stats.attached || stats.pending || stats.enabled) throw Error(`Retained saved behavior ${cycle}`);
  }
  expect({ creates, starts, updates, cleanups, disposals, badScope }).toEqual({ creates: 10_000, starts: 10_000, updates: 10_000, cleanups: 10_000, disposals: 10_000, badScope: 0 });
  expect(h.context().world.stats()).toMatchObject({ allocatedSlots: 2, runtime: 0, retiring: 0, dormant: 2 });
  expect(h.diagnostics).toEqual([]); h.session.dispose();
  expect(h.context().behaviors.stats()).toMatchObject({ attached: 0, pending: 0, enabled: 0, ended: true });
});
