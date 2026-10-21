import { expect, it } from "vitest";
import { createEntityWorld } from "../world/runtime/entity-world";
import { createEntityBehaviors } from "../behaviors/runtime/entity-behaviors";

it("reclaims 10,000 entity and behavior lifetimes without growing slots or retaining work", () => {
  const world = createEntityWorld({ capacity: 1 });
  let starts = 0, updates = 0, disposals = 0, cleanups = 0, diagnostics = 0;
  const host = createEntityBehaviors({ world: world.port, capacity: 1, report() { diagnostics++; } });
  // Aggregate counters avoid retaining per-lifetime spies or histories in the soak itself.
  const definition = { name: "Lifetime", create(scope: import("../behaviors/domain/entity-behaviors").EntityBehaviorScope) {
    scope.defer(() => { cleanups++; });
    return { start() { starts++; }, fixedUpdate() { updates++; }, dispose() { disposals++; if (!scope.signal.aborted) diagnostics++; } };
  } };
  const tick = (index: number) => ({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 });
  for (let cycle = 0; cycle < 10_000; cycle++) {
    const createTick = cycle * 2 + 1, receipt = world.port.submit([{ op: "create", key: "one", name: "One" }]); world.flush(createTick);
    const state = receipt.read(); if (state.status !== "committed") throw Error("Creation failed");
    const attachment = host.port.attach(state.created.one, definition); host.beginTick(tick(createTick)); host.fixedUpdate(tick(createTick));
    world.port.submit([{ op: "destroy", handle: state.created.one }]); world.flush(createTick + 1);
    host.beginTick(tick(createTick + 1)); host.fixedUpdate(tick(createTick + 1));
    if (attachment.read().reason !== "entity-removed" || host.port.stats().attached !== 0 || host.port.stats().pending !== 0) throw Error(`Retained lifecycle ${cycle}`);
  }
  expect({ starts, updates, disposals, cleanups, diagnostics }).toEqual({ starts: 10_000, updates: 10_000, disposals: 10_000, cleanups: 10_000, diagnostics: 0 });
  expect(world.port.stats()).toMatchObject({ allocatedSlots: 1, runtime: 0, retiring: 0 });
  host.dispose(); world.dispose(); expect(host.port.stats()).toMatchObject({ attached: 0, pending: 0, enabled: 0, ended: true });
});
