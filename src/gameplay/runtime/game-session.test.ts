import { describe, expect, it, vi } from "vitest";
import type { GameContext, GameInstance, GameModule, GameTick } from "../domain/game-module";
import { createGameSession } from "./game-session";
import { createEntityWorld } from "../../world/runtime/entity-world";

import { createRuntimePrefabs } from "../../prefabs/runtime/runtime-prefabs";

function harness(module: GameModule) {
  const world = createEntityWorld();
  const report = vi.fn(), beforeTick = vi.fn(), afterTick = vi.fn();
  const session = createGameSession(module, {
    report, beforeTick, afterTick,
    context: () => ({ animation: { snapshot: () => null, setFloat: vi.fn(), setInt: vi.fn(), setBool: vi.fn(), setTrigger: vi.fn(), resetTrigger: vi.fn(), subscribe: () => () => undefined }, entities: [], world: world.port, prefabs: createRuntimePrefabs(world.port, []), camera: {
      setPose: vi.fn(), snapshot: () => null, acquire: () => { throw Error("unused"); }, constrain: (_target, position) => position,
    }, characters: { move: vi.fn(), snapshot: () => null, acquire: () => { throw Error("unused"); } }, input: {
      action: vi.fn(), rebind: vi.fn(), bindings: vi.fn(), requestPointerLock: vi.fn(), releasePointerLock: vi.fn(), capturePointerLock: () => () => undefined, pointerLockStatus: () => ({ status: "unlocked" }),
    } }),
  });
  return { session, report, beforeTick, afterTick };
}

describe("game module session", () => {
  it("runs only admitted physics ticks and keeps presentation independent", async () => {
    const fixedUpdate = vi.fn(), update = vi.fn();
    const { session, afterTick } = harness({ version: 1, create: () => ({ fixedUpdate, update, dispose() {} }) });
    await session.start();
    for (let i = 0; i < 20; i++) session.updateFrame({ deltaSeconds: 1 / 30, interpolationAlpha: 0.5 });
    expect(fixedUpdate).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledTimes(20);
    for (let index = 1; index <= 5; index++) expect(session.fixedTick({ index, deltaSeconds: 1 / 60, elapsedSeconds: index / 60 })).toBe(true);
    expect(fixedUpdate.mock.calls.map(([tick]) => tick.index)).toEqual([1, 2, 3, 4, 5]);
    expect(fixedUpdate.mock.calls[4][0].elapsedSeconds).toBeCloseTo(5 / 60);
    expect(afterTick).toHaveBeenCalledTimes(5);
    session.dispose();
    expect(session.fixedTick({ index: 6, deltaSeconds: 1 / 60, elapsedSeconds: 0.1 })).toBe(false);
  });
  it.each(["duplicate", "changed delta", "local clock"])("fails closed on %s after physics takes ownership", async (fault) => {
    const dispose = vi.fn();
    const { session, report } = harness({ version: 1, create: () => ({ dispose }) });
    await session.start(); session.fixedTick({ index: 1, deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60 });
    if (fault === "local clock") session.advance(0.1);
    else session.fixedTick({ index: fault === "duplicate" ? 1 : 2, deltaSeconds: fault === "changed delta" ? 0.1 : 1 / 60, elapsedSeconds: 0.1 });
    expect(session.status()).toBe("failed"); expect(dispose).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ code: "gameplay-update-failed" }));
  });
  it("closes the command scope when a fixed callback fails", async () => {
    const { session, afterTick } = harness({ version: 1, create: () => ({ fixedUpdate() { throw new Error("tick failed"); }, dispose() {} }) });
    await session.start();
    expect(session.fixedTick({ index: 1, deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60 })).toBe(false);
    expect(afterTick).toHaveBeenCalledOnce();
  });
  it("produces the same fixed commands at 30 and 144 Hz", async () => {
    const run = async (hz: number) => {
      const ticks: GameTick[] = [];
      const { session } = harness({ version: 1, create: () => ({ fixedUpdate: (tick) => ticks.push(tick), dispose() {} }) });
      await session.start(); for (let frame = 0; frame < hz; frame++) session.advance(1 / hz);
      session.dispose(); return ticks;
    };
    const low = await run(30), high = await run(144);
    expect(low).toEqual(high); expect(low).toHaveLength(60);
  });
  it("aborts initialization, cleans registered resources, and disposes late instances", async () => {
    let complete!: (instance: GameInstance) => void;
    let context!: GameContext;
    const cleanup = vi.fn(), dispose = vi.fn();
    const { session } = harness({ version: 1, create: (value) => {
      context = value; value.defer(cleanup);
      return new Promise((resolve) => { complete = resolve; });
    } });
    const starting = session.start(); session.dispose();
    expect(context.signal.aborted).toBe(true); expect(cleanup).toHaveBeenCalledOnce();
    complete({ dispose }); await starting;
    expect(dispose).toHaveBeenCalledOnce(); expect(session.status()).toBe("disposed");
    session.dispose(); expect(dispose).toHaveBeenCalledOnce();
    const lateCleanup = vi.fn(); context.defer(lateCleanup); expect(lateCleanup).toHaveBeenCalledOnce();
  });
  it("stops a faulty update once and keeps disposing after cleanup failures", async () => {
    const fixedUpdate = vi.fn(() => { throw new Error("broken game"); }), cleanup = vi.fn();
    const { session, report } = harness({ version: 1, create: (context) => {
      context.defer(cleanup); context.defer(() => { throw new Error("cleanup"); });
      return { fixedUpdate, dispose: () => { throw new Error("dispose"); } };
    } });
    await session.start(); session.advance(1 / 30); session.advance(1 / 30);
    expect(session.status()).toBe("failed"); expect(fixedUpdate).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce(); expect(report.mock.calls.map(([d]) => d.code)).toEqual([
      "gameplay-cleanup-failed", "gameplay-cleanup-failed", "gameplay-update-failed",
    ]);
  });
  it("rejects asynchronous frame callbacks and reports dropped time without repeated spam", async () => {
    const { session, report } = harness({ version: 1, create: () => ({ fixedUpdate: async () => undefined, dispose() {} }) });
    await session.start(); session.advance(5); session.advance(5);
    expect(session.status()).toBe("failed");
    expect(report.mock.calls.map(([d]) => d.code)).toEqual(["gameplay-time-dropped", "gameplay-update-failed"]);
  });
  it("flushes queued events before fixedUpdate and supports a single explicit Step", async () => {
    const calls: string[] = [];
    const { session, beforeTick } = harness({ version: 1, create: (context) => {
      context.events.subscribe("start", () => calls.push("event")); context.events.emit({ type: "start" });
      return { fixedUpdate: () => calls.push("tick"), dispose() {} };
    } });
    session.step(); expect(calls).toEqual([]);
    await session.start(); session.step();
    expect(calls).toEqual(["event", "tick"]); expect(beforeTick).toHaveBeenCalledOnce();
    session.dispose(); session.step(); expect(calls).toHaveLength(2);
  });
});
