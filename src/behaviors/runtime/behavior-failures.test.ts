import { expect, it, vi } from "vitest";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { createEntityBehaviors } from "./entity-behaviors";
import type { EntityBehaviorDefinition, EntityBehaviorInstance, EntityBehaviorScope } from "../domain/entity-behaviors";

const tick = (index: number) => ({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 });
function setup() {
  const world = createEntityWorld({ authored: [{ id: "owner", name: "Owner" }] }), report = vi.fn();
  return { world, report, host: createEntityBehaviors({ world: world.port, report }), entity: world.port.findByAuthoredId("owner")! };
}

it.each(["create", "onEnable", "start", "fixedUpdate", "onDisable"] as const)("isolates %s failures, aborts ownership, and continues healthy siblings", (phase) => {
  const h = setup(), dispose = vi.fn(), cleanup = vi.fn(), good = vi.fn(); let scope!: EntityBehaviorScope;
  const bad = h.host.port.attach(h.entity, { name: "Broken", create(value) {
    scope = value; value.defer(cleanup);
    if (phase === "create") throw Error("controlled failure");
    return { [phase]() { throw Error("controlled failure"); }, dispose };
  } });
  h.host.port.attach(h.entity, { name: "Healthy", create: () => ({ fixedUpdate: good, dispose() {} }) });
  h.host.beginTick(tick(1)); h.host.fixedUpdate(tick(1));
  if (phase === "onDisable") { bad.setEnabled(false); h.host.beginTick(tick(2)); h.host.fixedUpdate(tick(2)); }
  expect(bad.read()).toMatchObject({ status: "failed", reason: "failed" }); expect(scope.signal.aborted).toBe(true);
  expect(cleanup).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledTimes(phase === "create" ? 0 : 1);
  expect(h.report).toHaveBeenCalledWith(expect.objectContaining({ name: "Broken", phase, message: "controlled failure" }));
  expect(good).toHaveBeenCalled(); expect(h.host.port.stats()).toMatchObject({ attached: 1, enabled: 1 });
  h.host.dispose(); expect(cleanup).toHaveBeenCalledOnce();
});

it("continues teardown after onDisable, dispose, cleanup and diagnostic observers throw", () => {
  const h = setup(), last = vi.fn(); h.report.mockImplementation(() => { throw Error("observer"); });
  h.host.port.attach(h.entity, { name: "Broken cleanup", create(scope) {
    scope.defer(last); scope.defer(() => { throw Error("cleanup"); });
    return { onDisable() { throw Error("disable"); }, dispose() { throw Error("dispose"); } };
  } });
  h.host.beginTick(tick(1)); expect(() => h.host.dispose()).not.toThrow(); expect(last).toHaveBeenCalledOnce();
  expect(h.report.mock.calls.map(([diagnostic]) => diagnostic.phase)).toEqual(["onDisable", "dispose", "cleanup"]);
  expect(h.host.port.stats()).toMatchObject({ ended: true, attached: 0, enabled: 0 });
});

it("rejects async factories, aborts registered work and disposes a late returned instance", async () => {
  const h = setup(), dispose = vi.fn(), cleanup = vi.fn(); let scope!: EntityBehaviorScope, finish!: (value: EntityBehaviorInstance) => void;
  const create = (value: EntityBehaviorScope) => {
    scope = value; value.defer(cleanup); return new Promise<EntityBehaviorInstance>((resolve) => { finish = resolve; });
  };
  const attachment = h.host.port.attach(h.entity, { name: "Async", create: create as unknown as EntityBehaviorDefinition["create"] });
  h.host.beginTick(tick(1)); expect(attachment.read().status).toBe("failed"); expect(scope.signal.aborted).toBe(true);
  expect(cleanup).toHaveBeenCalledOnce(); h.host.dispose(); finish({ dispose }); await Promise.resolve(); await Promise.resolve();
  expect(dispose).toHaveBeenCalledExactlyOnceWith("failed"); expect(h.report).toHaveBeenCalledOnce();
});

it("absorbs rejected thenables from factories, updates, disposal and late cleanups", async () => {
  const h = setup(); let scope!: EntityBehaviorScope;
  h.host.port.attach(h.entity, { name: "Factory rejection", create: (() => Promise.reject(Error("async factory"))) as unknown as EntityBehaviorDefinition["create"] });
  const attachment = h.host.port.attach(h.entity, { name: "Async update", create(value) {
    scope = value; value.defer(async () => { throw Error("cleanup"); });
    return { fixedUpdate: async () => { throw Error("update"); }, dispose: async () => { throw Error("dispose"); } };
  } });
  h.host.beginTick(tick(1)); h.host.fixedUpdate(tick(1));
  expect(attachment.read().status).toBe("failed"); scope.defer(async () => { throw Error("late cleanup"); });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(h.host.port.stats().attached).toBe(0); expect(h.report.mock.calls.map(([d]) => d.phase)).toEqual(["create", "dispose", "cleanup", "fixedUpdate", "cleanup"]);
});

it("validates callback shape, bounds cleanup ownership and reclaims failed capacity", () => {
  const h = setup(), dispose = vi.fn(), cleanup = vi.fn();
  const malformed = h.host.port.attach(h.entity, { name: "Malformed", create: () => ({ dispose, start: 4 }) as unknown as EntityBehaviorInstance });
  const overflow = h.host.port.attach(h.entity, { name: "Too many resources", create(scope) {
    for (let i = 0; i < 33; i++) scope.defer(cleanup);
    return { dispose() {} };
  } });
  h.host.beginTick(tick(1)); expect(dispose).toHaveBeenCalledOnce(); expect(cleanup).toHaveBeenCalledTimes(32);
  expect(malformed.read().status).toBe("failed"); expect(overflow.read().status).toBe("failed");
  expect(h.host.port.stats()).toMatchObject({ attached: 0, enabled: 0, pending: 0 });
});

it("enforces total capacity independently of per-entity and command limits", () => {
  const world = createEntityWorld({ authored: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
  const host = createEntityBehaviors({ world: world.port, report() {}, capacity: 1 }), definition = { name: "Only", create: () => ({ dispose() {} }) };
  host.port.attach(world.port.findByAuthoredId("a")!, definition);
  expect(() => host.port.attach(world.port.findByAuthoredId("b")!, definition)).toThrow(/capacity/);
  expect(() => createEntityBehaviors({ world: world.port, report() {}, capacity: 257 })).toThrow(/256/);
  host.dispose(); world.dispose();
});
