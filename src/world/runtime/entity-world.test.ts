import { describe, expect, it } from "vitest";
import { EntityWorldError, type EntityBatch, type EntityCommand, type EntityHandle } from "../domain/entity-world";
import { createEntityWorld } from "./entity-world";

const create = (key = "one"): EntityCommand => ({ op: "create", key, name: key });
function handle(batch: EntityBatch, key = "one"): EntityHandle {
  const state = batch.read();
  if (state.status !== "committed") throw new Error(`Expected commit, got ${state.status}`);
  return state.created[key];
}

describe("world-scoped entity identity and structural commands", () => {
  it("maps authored IDs, commits only at boundaries and changes generation on slot reuse", () => {
    const world = createEntityWorld({ capacity: 2, authored: [{ id: "hero", name: "Hero" }] });
    const hero = world.port.findByAuthoredId("hero")!;
    expect(world.port.inspect(hero).name).toBe("Hero");
    expect(Object.isFrozen(hero)).toBe(true);
    const first = world.port.submit([create()]);
    expect(first.read().status).toBe("queued"); expect(world.port.stats().alive).toBe(1);
    world.flush(1); const old = handle(first);
    const remove = world.port.submit([{ op: "destroy", handle: old }]);
    expect(world.port.isAlive(old)).toBe(true);
    world.flush(2); expect(remove.read()).toMatchObject({ status: "committed", removed: 1, tick: 2 });
    expect(world.port.isAlive(old)).toBe(false);
    const next = world.port.submit([create()]); world.flush(3);
    expect(handle(next).slot).toBe(old.slot); expect(handle(next).generation).toBeGreaterThan(old.generation);
    expect(() => world.port.inspect(old)).toThrow(expect.objectContaining({ code: "stale-handle" }));
    expect(world.port.isAlive(hero)).toBe(true);
    expect(world.port.stats()).toMatchObject({ alive: 2, runtime: 1, allocatedSlots: 2, queuedCommands: 0 });
    world.dispose(); expect(world.port.isAlive(hero)).toBe(false);
    expect(() => world.port.inspect(hero)).toThrow(expect.objectContaining({ code: "world-ended" }));
  });

  it("rejects cross-world references even when slots and generations match", () => {
    const first = createEntityWorld(), second = createEntityWorld();
    const a = first.port.submit([create()]), b = second.port.submit([create()]); first.flush(1); second.flush(1);
    expect(handle(a).slot).toBe(handle(b).slot); expect(handle(a).generation).toBe(handle(b).generation);
    expect(second.port.isAlive(handle(a))).toBe(false);
    const remove = second.port.submit([{ op: "destroy", handle: handle(a) }]); second.flush(2);
    expect(remove.read()).toMatchObject({ status: "rejected", code: "stale-handle" });
    expect(second.port.isAlive(handle(b))).toBe(true); first.dispose(); second.dispose();
  });

  it("rolls back the whole batch, preserves authored entities and rejects unsupported backends", () => {
    const world = createEntityWorld({ authored: [{ id: "hero", name: "Hero" }] });
    const hero = world.port.findByAuthoredId("hero")!;
    const batch = world.port.submit([create(), { op: "destroy", handle: hero }]); world.flush(1);
    expect(batch.read()).toMatchObject({ status: "rejected", code: "authored-entity" });
    expect(world.port.stats()).toMatchObject({ alive: 1, runtime: 0 });
    const unsupported = world.port.submit([{ op: "create", key: "mesh", name: "Mesh", components: ["meshRenderer"] }]); world.flush(2);
    expect(unsupported.read()).toMatchObject({ code: "unsupported-component" });
    const duplicate = world.port.submit([create(), create()]); world.flush(3);
    expect(duplicate.read()).toMatchObject({ code: "invalid-command" });
    expect(world.port.stats().alive).toBe(1); world.dispose();
  });

  it("captures caller input and protects immutable receipt results, including special keys", () => {
    const world = createEntityWorld();
    const command = { op: "create" as const, key: "__proto__", name: "original", components: [] as string[] };
    const batch = world.port.submit([command]); command.name = "changed"; command.components.push("unknown");
    world.flush(1);
    expect(world.port.inspect(handle(batch, "__proto__")).name).toBe("original");
    expect(Object.isFrozen(batch.read())).toBe(true);
    expect(Object.isFrozen(world.port.inspect(handle(batch, "__proto__")).components)).toBe(true); world.dispose();
  });

  it("bounds capacity, payloads and both queue dimensions without leaking reserved slots", () => {
    const world = createEntityWorld({ capacity: 1 });
    const tooMany = world.port.submit([create("a"), create("b")]); world.flush(1);
    expect(tooMany.read()).toMatchObject({ code: "capacity" }); expect(world.port.stats().alive).toBe(0);
    const okay = world.port.submit([create()]); world.flush(2); expect(world.port.isAlive(handle(okay))).toBe(true);
    expect(() => world.port.submit(Array.from({ length: 129 }, () => create()))).toThrow(EntityWorldError);
    expect(() => world.port.submit([{ op: "create", key: "x", name: "x".repeat(257) }])).toThrow(EntityWorldError);
    for (let i = 0; i < 64; i++) world.port.submit([create()]);
    expect(() => world.port.submit([create()])).toThrow(expect.objectContaining({ code: "capacity" }));
    world.dispose(); expect(world.port.stats().queuedCommands).toBe(0);
    const commands = createEntityWorld();
    commands.port.submit(Array.from({ length: 128 }, () => create())); commands.port.submit(Array.from({ length: 128 }, () => create()));
    expect(() => commands.port.submit([create()])).toThrow(EntityWorldError); commands.dispose();
  });

  it("processes one FIFO batch per tick and rejects retained commands after Stop", () => {
    const world = createEntityWorld();
    const a = world.port.submit([create()]), b = world.port.submit([create()]), c = world.port.submit([create()]);
    world.flush(1); expect(a.read().status).toBe("committed"); expect(b.read().status).toBe("queued");
    expect(() => world.flush(1)).toThrow(EntityWorldError);
    world.flush(2); expect(b.read().status).toBe("committed");
    world.dispose(); world.dispose();
    expect(c.read()).toMatchObject({ status: "rejected", code: "world-ended" });
    expect(() => world.port.submit([create()])).toThrow(expect.objectContaining({ code: "world-ended" }));
    expect(world.port.stats()).toMatchObject({ alive: 0, runtime: 0, queuedCommands: 0, ended: true });
  });
});
