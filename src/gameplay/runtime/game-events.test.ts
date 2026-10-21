import { describe, expect, it, vi } from "vitest";
import { createGameEvents, GAME_EVENT_LIMITS } from "./game-events";

describe("bounded game events", () => {
  it("copies payloads and delays recursively emitted events to the next tick", () => {
    const events = createGameEvents(vi.fn());
    const values: number[] = [];
    events.port.subscribe("count", (event) => {
      values.push(event.payload!.n as number);
      events.port.emit({ type: "count", payload: { n: 2 } });
    });
    const payload = { n: 1 };
    events.port.emit({ type: "count", payload }); payload.n = 9;
    events.flush(); expect(values).toEqual([1]);
    events.flush(); expect(values).toEqual([1, 2]);
    events.dispose(); events.flush(); expect(values).toEqual([1, 2]);
  });
  it("rejects overflow and releases subscription capacity", () => {
    const events = createGameEvents(vi.fn());
    const unsubscribes = Array.from({ length: GAME_EVENT_LIMITS.listeners }, () => events.port.subscribe("a", vi.fn()));
    expect(() => events.port.subscribe("a", vi.fn())).toThrow(/capacity/);
    unsubscribes[0](); unsubscribes[0]();
    expect(() => events.port.subscribe("a", vi.fn())).not.toThrow();
    for (let i = 0; i < GAME_EVENT_LIMITS.queued; i++) events.port.emit({ type: "a" });
    expect(() => events.port.emit({ type: "a" })).toThrow(/capacity/);
    events.flush(); expect(() => events.port.emit({ type: "a" })).not.toThrow();
  });
  it("contains listener errors and honors removal during delivery", () => {
    const report = vi.fn(), events = createGameEvents(report), later = vi.fn();
    let remove: () => void = () => undefined;
    events.port.subscribe("a", () => { remove(); throw new Error("bad listener"); });
    remove = events.port.subscribe("a", later);
    events.port.emit({ type: "a" }); events.flush();
    expect(report).toHaveBeenCalledOnce(); expect(later).not.toHaveBeenCalled();
  });
});
