import { expect, it, vi } from "vitest";
import type { GameContext } from "../domain/game-module";
import type { EntityBatch } from "../../world/domain/entity-world";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { createGameWorldSession } from "./game-world-session";
import { makeObject } from "../../lib/payload";

it("flushes structural changes before events and fixedUpdate, keeping authored snapshots untouched", async () => {
  let context!: GameContext, fromTick: EntityBatch | undefined;
  const observations: number[] = [], objects = [makeObject("cube", 0, { id: "authored" })], original = structuredClone(objects);
  const session = createGameWorldSession({
    renderSession: {} as BrowserThreeWebGpuRenderSession, objects, timing: {}, report: vi.fn(),
    module: { version: 1, create(value) {
      context = value;
      context.events.subscribe("check", () => observations.push(context.world.stats().runtime));
      return { fixedUpdate() {
        observations.push(context.world.stats().runtime);
        fromTick ??= context.world.submit([{ op: "create", key: "later", name: "Later" }]);
      }, dispose() {} };
    } },
  });
  await session.start();
  const beforeTick = context.world.submit([{ op: "create", key: "first", name: "First" }]);
  context.events.emit({ type: "check" });
  expect(context.world.stats().runtime).toBe(0);
  session.step(); expect(beforeTick.read().status).toBe("committed");
  expect(observations).toEqual([1, 1]); expect(fromTick!.read().status).toBe("queued");
  session.step(); expect(observations).toEqual([1, 1, 2]);
  expect(objects).toEqual(original);
  const authored = context.world.findByAuthoredId("authored")!;
  session.dispose(); expect(context.world.isAlive(authored)).toBe(false);
  expect(context.world.stats()).toMatchObject({ ended: true, alive: 0, runtime: 0 });
  expect(objects).toEqual(original);
});

it("revokes queued work and handles when gameplay fails during startup or a tick", async () => {
  for (const stage of ["startup", "tick"]) {
    let context!: GameContext, receipt!: EntityBatch;
    const session = createGameWorldSession({
      renderSession: {} as BrowserThreeWebGpuRenderSession, objects: [], timing: {}, report: vi.fn(),
      module: { version: 1, create(value) {
        context = value; receipt = context.world.submit([{ op: "create", key: "first", name: "First" }]);
        if (stage === "startup") throw new Error("startup failed");
        return { fixedUpdate() { throw new Error("tick failed"); }, dispose() {} };
      } },
    });
    await session.start(); session.step();
    expect(context.world.stats()).toMatchObject({ ended: true, alive: 0, queuedCommands: 0 });
    if (stage === "startup") expect(receipt.read()).toMatchObject({ status: "rejected", code: "world-ended" });
    else {
      const result = receipt.read(); expect(result.status).toBe("committed");
      if (result.status === "committed") expect(context.world.isAlive(result.created.first)).toBe(false);
    }
    session.dispose();
  }
});
