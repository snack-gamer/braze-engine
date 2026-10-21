import { expect, it, vi } from "vitest";
import { makeObject } from "../../lib/payload";
import type { BehaviorRegistration, RegisteredBehaviorScope } from "../domain/behavior-registration";
import type { BehaviorComponent, BehaviorValues } from "../domain/behavior-component";
import { registeredBehaviorFixture, savedBehavior } from "../testing/registered-behavior-fixture";

it("captures scene values and defaults before Play, activates after project create, and owns cleanup", async () => {
  const calls: string[] = [], received: BehaviorValues[] = [];
  let scope!: RegisteredBehaviorScope;
  const values = { speed: 0, target: { entityId: "other" }, flag: false, text: "" };
  const objects = [makeObject("cube", 0, { id: "owner", behaviors: savedBehavior("one", values) }), makeObject("cube", 1, { id: "other" })];
  const registration: BehaviorRegistration = { id: "demo.counter", label: "Counter", version: 1, fields: [
    { key: "speed", label: "Speed", kind: "number", default: 3, min: 0 },
    { key: "flag", label: "Flag", kind: "boolean", default: true },
    { key: "text", label: "Text", kind: "string", default: "default" },
    { key: "target", label: "Target", kind: "entity", default: null },
    { key: "bonus", label: "Bonus", kind: "number", default: 7 },
  ], create(value, input, context) {
    scope = value; calls.push("create"); received.push(input);
    expect(value.resolveEntity(input.target as { entityId: string })).toEqual(context.world.findByAuthoredId("other"));
    expect(Object.isFrozen(input)).toBe(true); expect(Object.isFrozen(input.target)).toBe(true);
    value.defer(() => calls.push(`cleanup:${value.signal.aborted}`));
    return { onEnable() { calls.push("enable"); }, start() { calls.push("start"); }, fixedUpdate() { calls.push("tick"); },
      onDisable() { calls.push("disable"); }, dispose(reason) { calls.push(`dispose:${reason}`); } };
  } };
  const h = registeredBehaviorFixture({ registrations: [registration], objects, create() { calls.push("project"); return { dispose() {} }; } });
  values.speed = 99; values.target.entityId = "owner";
  const snapshot = structuredClone(objects);
  await h.session.start(); expect(calls).toEqual(["project"]);
  h.session.step(); expect(calls).toEqual(["project", "create", "enable", "start", "tick"]);
  expect(received).toEqual([{ speed: 0, target: { entityId: "other" }, flag: false, text: "", bonus: 7 }]);
  h.session.dispose();
  expect(calls.slice(-3)).toEqual(["disable", "dispose:world-ended", "cleanup:true"]);
  expect(scope.resolveEntity({ entityId: "other" })).toBeUndefined();
  expect(objects).toEqual(snapshot); expect(h.diagnostics).toEqual([]);
});

it("instantiates disabled saved declarations and exposes them for queued enable, disable and detach", async () => {
  const create = vi.fn(), start = vi.fn(), update = vi.fn(), dispose = vi.fn();
  const h = registeredBehaviorFixture({
    objects: [makeObject("cube", 0, { id: "owner", behaviors: savedBehavior("one", {}, "demo.counter", false) })],
    registrations: [{ id: "demo.counter", label: "Counter", version: 1, fields: [], create() { create(); return { start, fixedUpdate: update, dispose }; } }],
  });
  await h.session.start(); h.session.step(); h.session.step();
  expect(create).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  expect(h.context().behaviors.stats()).toMatchObject({ attached: 1, enabled: 0 });
  const attachment = h.context().behaviors.find(h.context().world.findByAuthoredId("owner")!, "saved:one")!;
  attachment.setEnabled(true); expect(attachment.read().enabled).toBe(false); h.session.step();
  expect(start).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledOnce();
  attachment.setEnabled(false); h.session.step(); expect(update).toHaveBeenCalledOnce();
  attachment.detach(); h.session.step(); expect(dispose).toHaveBeenCalledExactlyOnceWith("detached");
  expect(h.context().behaviors.find(attachment.entity, "saved:one")).toBeUndefined();
  h.session.dispose();
});

it("isolates missing types, version changes, malformed known fields and factory errors", async () => {
  const good = vi.fn(), project = vi.fn();
  const behaviors: BehaviorComponent = { version: 1, entries: [
    savedBehavior("missing", {}, "gone").entries[0],
    { ...savedBehavior("version").entries[0], typeVersion: 2 },
    savedBehavior("invalid", { speed: "wrong" }).entries[0],
    savedBehavior("throws", {}, "demo.throws").entries[0],
    savedBehavior("good", { speed: 4 }).entries[0],
  ] };
  const h = registeredBehaviorFixture({ objects: [makeObject("cube", 0, { id: "owner", behaviors })],
    registrations: [
      { id: "demo.counter", label: "Counter", version: 1, fields: [{ key: "speed", label: "Speed", kind: "number", default: 1 }], create: () => ({ fixedUpdate: good, dispose() {} }) },
      { id: "demo.throws", label: "Throws", version: 1, fields: [], create() { throw Error("controlled factory failure"); } },
    ], create: () => ({ fixedUpdate: project, dispose() {} }),
  });
  await h.session.start(); h.session.step(); h.session.step();
  expect(h.session.status()).toBe("running"); expect(project).toHaveBeenCalledTimes(2); expect(good).toHaveBeenCalledTimes(2);
  expect(h.context().behaviors.stats()).toMatchObject({ attached: 1, pending: 0 });
  expect(h.diagnostics).toHaveLength(4); expect(h.diagnostics.every((value) => value.code === "entity-behavior-failed")).toBe(true);
  expect(h.diagnostics.map((value) => value.message).join("\n")).toMatch(/unavailable[\s\S]*saved version 2[\s\S]*permitted range[\s\S]*controlled factory failure/);
  h.session.dispose();
});

it("diagnoses an unavailable saved envelope locally without destroying its source or healthy siblings", async () => {
  const component: BehaviorComponent = { version: 1, entries: [], unavailable: { message: "Unsupported future component", source: { version: 50, payload: [1, 2] } } };
  const update = vi.fn();
  const h = registeredBehaviorFixture({ registrations: [], objects: [makeObject("cube", 0, { id: "owner", behaviors: component })],
    create: () => ({ fixedUpdate: update, dispose() {} }),
  });
  const original = structuredClone(h.objects);
  await h.session.start(); h.session.step(); h.session.step();
  expect(h.session.status()).toBe("running"); expect(update).toHaveBeenCalledTimes(2);
  expect(h.diagnostics).toHaveLength(1); expect(h.diagnostics[0].message).toContain("Unsupported future component");
  expect(h.objects).toEqual(original); h.session.dispose();
});

it("starts fresh factory state in every Play session", async () => {
  const counts: number[] = [], scopes: RegisteredBehaviorScope[] = [];
  const registration: BehaviorRegistration = { id: "demo.counter", label: "Counter", version: 1, fields: [], create(scope) {
    scopes.push(scope); let count = 0; return { fixedUpdate() { counts.push(++count); }, dispose() {} };
  } };
  for (let run = 0; run < 2; run++) {
    const h = registeredBehaviorFixture({ registrations: [registration] }); await h.session.start(); h.session.step(); h.session.dispose();
    expect(h.context().behaviors.stats()).toMatchObject({ attached: 0, pending: 0, ended: true });
  }
  expect(counts).toEqual([1, 1]); expect(scopes[0].entity.world).not.toBe(scopes[1].entity.world);
  expect(scopes.every((scope) => scope.signal.aborted)).toBe(true);
});
