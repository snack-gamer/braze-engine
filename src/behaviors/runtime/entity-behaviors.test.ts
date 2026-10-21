import { expect, it, vi } from "vitest";
import { createEntityWorld } from "../../world/runtime/entity-world";
import { createEntityBehaviors } from "./entity-behaviors";
import type { EntityBehaviorAttachment, EntityBehaviorDefinition, EntityBehaviorScope } from "../domain/entity-behaviors";

const tick = (index: number) => ({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 });
function harness() {
  const world = createEntityWorld({ authored: [{ id: "hero", name: "Hero" }] }), report = vi.fn();
  const host = createEntityBehaviors({ world: world.port, report });
  let index = 0;
  return { world, host, report, entity: world.port.findByAuthoredId("hero")!, step() {
    const current = tick(++index); world.flush(index); host.beginTick(current); host.fixedUpdate(current);
  } };
}

it("owns start, enable/disable, frozen state and reverse cleanup across queued boundaries", () => {
  const h = harness(), calls: string[] = []; let scope!: EntityBehaviorScope;
  const attachment = h.host.port.attach(h.entity, { name: "Counter", create(value) {
    scope = value; calls.push("create"); value.defer(() => calls.push("cleanup1")); value.defer(() => calls.push("cleanup2"));
    return { onEnable() { calls.push("enable"); }, start() { calls.push("start"); },
      fixedUpdate(t) { calls.push(`tick${t.index}`); expect(Object.isFrozen(t)).toBe(true); },
      onDisable() { calls.push("disable"); }, dispose(reason) { expect(value.signal.aborted).toBe(true); calls.push(reason); } };
  } }, { enabled: false });
  const initial = attachment.read(); expect(Object.isFrozen(initial)).toBe(true);
  expect(initial).toEqual({ status: "queued", enabled: false, started: false });
  h.step(); expect(calls).toEqual(["create"]); expect(attachment.read().status).toBe("disabled");
  attachment.setEnabled(true); expect(attachment.read().enabled).toBe(false);
  h.step(); expect(calls).toEqual(["create", "enable", "start", "tick2"]);
  attachment.setEnabled(false); h.step(); attachment.setEnabled(true); h.step();
  expect(calls).toEqual(["create", "enable", "start", "tick2", "disable", "enable", "tick4"]);
  attachment.detach(); h.step(); h.host.dispose(); h.host.dispose();
  expect(calls.slice(-4)).toEqual(["disable", "detached", "cleanup2", "cleanup1"]);
  expect(initial.status).toBe("queued"); expect(attachment.read()).toMatchObject({ status: "disposed", reason: "detached" });
  scope.defer(() => calls.push("late")); expect(calls[calls.length - 1]).toBe("late");
  expect(h.host.port.stats()).toMatchObject({ attached: 0, pending: 0, enabled: 0, ended: true });
});

it("captures caller inputs and delays callback requests until the next fixed boundary", () => {
  const h = harness(), calls: string[] = []; let first!: EntityBehaviorAttachment, second!: EntityBehaviorAttachment;
  const definition: { name: string; create: EntityBehaviorDefinition["create"] } = { name: "First", create() {
    first.setEnabled(false);
    second = h.host.port.attach(h.entity, { name: "Second", create: () => ({ fixedUpdate: () => calls.push("second"), dispose() {} }) });
    return { fixedUpdate() { calls.push("first"); }, dispose() {} };
  } };
  const settings = { enabled: true }; first = h.host.port.attach({ ...h.entity }, definition, settings);
  definition.name = "Mutated"; definition.create = () => { throw Error("mutated factory"); }; settings.enabled = false;
  h.step(); expect(calls).toEqual(["first"]); expect(second.read().status).toBe("queued"); expect(first.name).toBe("First");
  h.step(); expect(calls).toEqual(["first", "second"]); expect(first.read().status).toBe("disabled");
  h.host.dispose(); h.world.dispose();
});

it("snapshots an empty command queue before removed-owner cleanup queues new work", () => {
  const h = harness(), creation = h.world.port.submit([{ op: "create", key: "runtime", name: "Runtime" }]); h.step();
  const state = creation.read(); if (state.status !== "committed") throw Error("creation failed");
  const update = vi.fn(); let successor!: EntityBehaviorAttachment;
  const predecessor = h.host.port.attach(state.created.runtime, { name: "Owner", create: () => ({ dispose(reason) {
    expect(reason).toBe("entity-removed");
    successor = h.host.port.attach(h.entity, { name: "Successor", create: () => ({ fixedUpdate: update, dispose() {} }) });
  } }) });
  h.step(); h.world.port.submit([{ op: "destroy", handle: state.created.runtime }]); h.step();
  expect(predecessor.read().reason).toBe("entity-removed"); expect(successor.read().status).toBe("queued"); expect(update).not.toHaveBeenCalled();
  h.step(); expect(update).toHaveBeenCalledOnce(); h.host.dispose(); h.world.dispose();
});

it("ends queued attachments without creating instances and cleans reentrant Stop during creation", () => {
  const h = harness(), never = vi.fn(), first = h.host.port.attach(h.entity, { name: "Pending", create: never });
  h.host.dispose(); expect(never).not.toHaveBeenCalled(); expect(first.read().reason).toBe("world-ended");
  expect(() => first.detach()).toThrow(/ended/); expect(() => h.host.port.attach(h.entity, { name: "Again", create: never })).toThrow(/ended/);
  const next = harness(), cleanup = vi.fn(), dispose = vi.fn();
  const attachment = next.host.port.attach(next.entity, { name: "Stop", create(scope) {
    next.host.dispose(); scope.defer(cleanup); return { dispose };
  } });
  next.host.beginTick(tick(1)); expect(cleanup).toHaveBeenCalledOnce(); expect(dispose).toHaveBeenCalledWith("world-ended");
  expect(attachment.read().reason).toBe("world-ended"); expect(next.host.port.stats().attached).toBe(0);
});

it("bounds names, pending operations and per-entity attachments; rejects stale and foreign owners", () => {
  const h = harness(), other = harness(), definition = (name: string) => ({ name, create: () => ({ dispose() {} }) });
  expect(() => h.host.port.attach(other.entity, definition("Foreign"))).toThrow(/another world/);
  expect(() => h.host.port.attach(h.entity, definition(""))).toThrow(/name/);
  const first = h.host.port.attach(h.entity, definition("First"));
  expect(() => h.host.port.attach(h.entity, definition("First"))).toThrow(/already attached/);
  for (let i = 0; i < 7; i++) h.host.port.attach(h.entity, definition(`Other${i}`));
  expect(() => h.host.port.attach(h.entity, definition("Overflow"))).toThrow(/eight/);
  h.step(); for (let i = 0; i < 256; i++) first.setEnabled(false);
  expect(h.host.port.stats().pending).toBe(256); expect(() => first.detach()).toThrow(/capacity/);
  h.step(); first.detach(); h.step(); expect(() => first.setEnabled(true)).toThrow(/ended/);
  h.host.dispose(); h.world.dispose(); other.host.dispose(); other.world.dispose();
});

it("uses each admitted tick once and rejects reentrant callbacks without stopping siblings", () => {
  const h = harness(), good = vi.fn();
  const broken = h.host.port.attach(h.entity, { name: "Reentrant", create: () => ({ fixedUpdate(t) { h.host.beginTick(tick(t.index + 1)); }, dispose() {} }) });
  h.host.port.attach(h.entity, { name: "Healthy", create: () => ({ fixedUpdate: good, dispose() {} }) });
  h.step(); expect(broken.read().status).toBe("failed"); expect(good).toHaveBeenCalledOnce();
  expect(() => h.host.fixedUpdate(tick(1))).toThrow(/exactly once/);
  expect(() => h.host.beginTick(tick(1))).toThrow(/increasing/);
  h.host.dispose();
});

it("looks up a stable live receipt by owner and name without accepting stale or foreign handles", () => {
  const h = harness(), other = harness();
  const attachment = h.host.port.attach(h.entity, { name: "Named", create: () => ({ dispose() {} }) });
  expect(h.host.port.find({ ...h.entity }, "Named")).toBe(attachment);
  expect(h.host.port.find(h.entity, "Absent")).toBeUndefined();
  expect(() => h.host.port.find(other.entity, "Named")).toThrow(/another world/);
  expect(() => h.host.port.find(h.entity, "")).toThrow(/name/);
  h.step(); expect(h.host.port.find(h.entity, "Named")).toBe(attachment);
  attachment.detach(); h.step(); expect(h.host.port.find(h.entity, "Named")).toBeUndefined();
  expect(attachment.read().status).toBe("disposed");
  h.host.dispose(); expect(() => h.host.port.find(h.entity, "Named")).toThrow(/ended/);
  h.world.dispose(); other.host.dispose(); other.world.dispose();
});

it("admits saved declarations immediately while removal cleanup requests remain on the next tick", () => {
  const h = harness(), creation = h.world.port.submit([{ op: "create", key: "runtime", name: "Runtime" }]); h.step();
  const state = creation.read(); if (state.status !== "committed") throw Error("creation failed");
  const update = vi.fn(), saved = vi.fn(); let successor!: EntityBehaviorAttachment;
  h.host.port.attach(state.created.runtime, { name: "Owner", create: () => ({ dispose() {
    successor = h.host.port.attach(h.entity, { name: "Successor", create: () => ({ fixedUpdate: update, dispose() {} }) });
  } }) });
  h.step(); h.world.port.submit([{ op: "destroy", handle: state.created.runtime }]); h.world.flush(3);
  h.host.beginTick(tick(3), () => {
    h.host.port.attach(h.entity, { name: "Saved", create: () => ({ fixedUpdate: saved, dispose() {} }) });
  }); h.host.fixedUpdate(tick(3));
  expect(successor.read().status).toBe("queued"); expect(update).not.toHaveBeenCalled(); expect(saved).toHaveBeenCalledOnce();
  expect(() => h.host.port.find(state.created.runtime, "Owner")).toThrow(/stale/);
  h.world.flush(4); h.host.beginTick(tick(4)); h.host.fixedUpdate(tick(4));
  expect(update).toHaveBeenCalledOnce(); h.host.dispose(); h.world.dispose();
});
