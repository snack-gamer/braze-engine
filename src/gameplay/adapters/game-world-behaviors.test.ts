import { expect, it, vi } from "vitest";
import type { GameContext, GameModule } from "../domain/game-module";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { createGameWorldSession } from "./game-world-session";
import { makeObject } from "../../lib/payload";

function harness(module: GameModule) {
  const objects = [makeObject("cube", 0, { id: "owner" })], report = vi.fn();
  const session = createGameWorldSession({ module, objects, timing: {}, report,
    renderSession: {} as BrowserThreeWebGpuRenderSession });
  return { session, report, objects };
}

it("starts behavior before events and runs its fixed update after project logic", async () => {
  const calls: string[] = [];
  let context!: GameContext;
  const h = harness({ version: 1, create(value) {
    context = value;
    value.behaviors.attach(value.world.findByAuthoredId("owner")!, { name: "Observer", create(scope) {
      calls.push("create");
      scope.defer(value.events.subscribe("check", () => calls.push("event")));
      return { onEnable() { calls.push("enable"); }, start() { calls.push("start"); },
        fixedUpdate(tick) { calls.push(`behavior:${tick.index}`); }, dispose() { calls.push("dispose"); } };
    } });
    return { fixedUpdate(tick) { calls.push(`project:${tick.index}`); }, dispose() {} };
  } });
  const original = structuredClone(h.objects);
  await h.session.start(); expect(calls).toEqual([]);
  context.events.emit({ type: "check" }); h.session.step();
  expect(calls).toEqual(["create", "enable", "start", "event", "project:1", "behavior:1"]);
  h.session.step(); expect(calls.slice(-2)).toEqual(["project:2", "behavior:2"]);
  h.session.dispose(); expect(calls.filter((value) => value === "dispose")).toHaveLength(1);
  expect(h.objects).toEqual(original);
});

it("ends a removed owner's behavior and subscription before that tick's events", async () => {
  let context!: GameContext;
  const callback = vi.fn(), cleanup = vi.fn(), dispose = vi.fn(), update = vi.fn();
  const h = harness({ version: 1, create(value) { context = value; return { dispose() {} }; } });
  await h.session.start();
  const spawn = context.world.submit([{ op: "create", key: "child", name: "Child" }]); h.session.step();
  const created = spawn.read(); if (created.status !== "committed") throw Error("Create failed");
  const attachment = context.behaviors.attach(created.created.child, { name: "Subscriber", create(scope) {
    scope.defer(context.events.subscribe("check", callback)); scope.defer(cleanup);
    return { fixedUpdate: update, dispose };
  } });
  h.session.step(); expect(update).toHaveBeenCalledOnce();
  context.world.submit([{ op: "destroy", handle: created.created.child }]); context.events.emit({ type: "check" });
  h.session.step();
  expect(callback).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledOnce(); expect(cleanup).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledWith("entity-removed");
  expect(attachment.read()).toMatchObject({ status: "disposed", reason: "entity-removed" });
  expect(context.behaviors.stats()).toMatchObject({ attached: 0, pending: 0 });
  h.session.dispose(); expect(dispose).toHaveBeenCalledOnce();
});

it("isolates a failed behavior while project and sibling updates continue", async () => {
  let context!: GameContext;
  const healthy = vi.fn(), project = vi.fn(), broken = vi.fn(() => { throw Error("controlled behavior fault"); });
  const h = harness({ version: 1, create(value) {
    context = value; const owner = value.world.findByAuthoredId("owner")!;
    value.behaviors.attach(owner, { name: "Broken", create: () => ({ fixedUpdate: broken, dispose() {} }) });
    value.behaviors.attach(owner, { name: "Healthy", create: () => ({ fixedUpdate: healthy, dispose() {} }) });
    return { fixedUpdate: project, dispose() {} };
  } });
  await h.session.start(); h.session.step(); h.session.step();
  expect(h.session.status()).toBe("running"); expect(broken).toHaveBeenCalledOnce();
  expect(project).toHaveBeenCalledTimes(2); expect(healthy).toHaveBeenCalledTimes(2);
  expect(context.behaviors.stats().attached).toBe(1);
  expect(h.report).toHaveBeenCalledOnce();
  expect(h.report).toHaveBeenCalledWith(expect.objectContaining({ code: "entity-behavior-failed", message: expect.stringContaining("controlled behavior fault") }));
  h.session.dispose();
});

it("aborts behavior scope and cleans it before world teardown on Stop or a project failure", async () => {
  for (const fail of [false, true]) {
    let context!: GameContext, scopeSignal!: AbortSignal;
    const calls: string[] = [];
    const h = harness({ version: 1, create(value) {
      context = value; const owner = value.world.findByAuthoredId("owner")!;
      value.behaviors.attach(owner, { name: "Owner", create(scope) {
        scopeSignal = scope.signal;
        scope.defer(() => { expect(scope.signal.aborted).toBe(true); calls.push("cleanup"); });
        return { onDisable() { calls.push("disable"); }, dispose(reason) {
          expect(value.world.isAlive(owner)).toBe(true); expect(scope.signal.aborted).toBe(true); calls.push(reason);
        } };
      } });
      return { fixedUpdate() { if (fail) throw Error("fatal project fault"); }, dispose() { calls.push("project disposed"); } };
    } });
    await h.session.start(); h.session.step(); if (!fail) h.session.dispose();
    expect(scopeSignal.aborted).toBe(true); expect(calls).toEqual(["disable", "world-ended", "cleanup", "project disposed"]);
    expect(context.world.stats().ended).toBe(true); expect(context.behaviors.stats()).toMatchObject({ attached: 0, ended: true });
    h.session.dispose(); expect(calls).toHaveLength(4);
  }
});
