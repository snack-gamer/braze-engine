import { describe, expect, it, vi } from "vitest";
import { createUiCanvas, type UiDocument } from "../domain/ui-document";
import { createUiSession } from "./ui-session";
const document = (): UiDocument => ({ ...createUiCanvas(), root: { id: "root", kind: "panel", children: [
  { id: "score", kind: "text", text: "0" }, { id: "add", kind: "button", action: "add", text: "Add" },
  { id: "name", kind: "input", action: "name", value: "" },
] } });

describe("UI Play session", () => {
  it("queues actions into fixed ticks, coalesces text, rejects disabled ancestors, and releases listeners", () => {
    const session = createUiSession(), screen = session.port.create("hud", document()), calls = vi.fn();
    const remove = screen.on("add", calls); screen.on("name", calls);
    session.setEnabled(true); session.dispatch("hud", "add"); expect(calls).not.toHaveBeenCalled();
    session.dispatch("hud", "name", "A"); session.dispatch("hud", "name", "Ada");
    session.advance(1 / 60); expect(calls).toHaveBeenCalledTimes(2); expect(screen.inspect("name").value).toBe("Ada");
    screen.update("root", { disabled: true }); session.dispatch("hud", "add"); session.advance(1 / 60); expect(calls).toHaveBeenCalledTimes(2);
    screen.update("root", { disabled: false }); session.dispatch("hud", "add"); session.setEnabled(false); session.setEnabled(true); session.advance(1 / 60); expect(calls).toHaveBeenCalledTimes(2);
    remove(); screen.dispose(); remove(); expect(session.stats()).toMatchObject({ screens: 0, nodes: 0, events: 0, listeners: 0 });
    expect(() => screen.inspect("score")).toThrow(/disposed/);
  });
  it("isolates reused layouts and validates updates before mutation", () => {
    const session = createUiSession(), source = document(), first = session.port.create("first", source), second = session.port.create("second", source);
    first.update("score", { text: "3" }); expect(second.inspect("score").text).toBe("0"); expect(source.root.children?.[0].text).toBe("0");
    expect(first.inspect("root").children?.[0].text).toBe("3");
    expect(() => first.update("score", { style: { color: "$missing" } })).toThrow(/token/);
    expect(first.inspect("score").style?.color).toBeUndefined();
    expect(() => first.update("name", { value: 4 })).toThrow(/value/);
    session.dispose(); expect(() => session.port.create("new", source)).toThrow(/ended/);
  });
  it("uses admitted time for delay/repeat/yoyo, replacement, cancellation and reduced motion", () => {
    const session = createUiSession(), screen = session.port.create("hud", document());
    const tween = screen.tween("score", { x: 100 }, { duration: 0.5, delay: 0.25, repeat: 1, yoyo: true });
    session.advance(0.25); expect(screen.inspect("score").style?.x).toBe(0);
    session.advance(0.25); expect(screen.inspect("score").style?.x).toBe(50);
    session.advance(0.25); session.advance(0.25); session.advance(0.25);
    expect(tween.state()).toBe("completed"); expect(screen.inspect("score").style?.x).toBe(0);
    const old = screen.tween("score", { opacity: 0 }, { duration: 1 }); session.advance(0.25);
    const next = screen.tween("score", { opacity: 1 }, { duration: 1 }); expect(old.state()).toBe("cancelled");
    session.setReducedMotion(true); session.advance(1 / 60); expect(next.state()).toBe("completed"); expect(screen.inspect("score").style?.opacity).toBe(1);
    const cancelled = screen.tween("score", { x: 1 }, { duration: 1 }); screen.update("score", { style: { x: 2 } }); expect(cancelled.state()).toBe("cancelled");
    expect(() => screen.tween("score", { x: NaN }, { duration: 1 })).toThrow(); expect(session.stats().tweens).toBe(0);
    session.dispose();
  });
  it("bounds callback mutation and prevents queued actions reaching a recreated screen", () => {
    const session = createUiSession(); session.setEnabled(true);
    let screen = session.port.create("hud", document()), calls = 0;
    let remove = () => {};
    const callback = () => { calls++; remove(); remove = screen.on("add", callback); };
    remove = screen.on("add", callback); session.dispatch("hud", "add"); session.advance(1 / 60); expect(calls).toBe(1);
    remove(); screen.on("add", () => { screen.dispose(); screen = session.port.create("hud", document()); screen.on("add", callback); });
    session.dispatch("hud", "add"); session.dispatch("hud", "add"); session.advance(1 / 60); expect(calls).toBe(1);
    session.dispatch("hud", "add"); session.advance(1 / 60); expect(calls).toBe(2); session.dispose();
  });
  it("rejects asynchronous action handlers without leaking a rejected promise", async () => {
    const session = createUiSession(), screen = session.port.create("hud", document()); session.setEnabled(true);
    screen.on("add", async () => { throw new Error("async failure"); }); session.dispatch("hud", "add");
    expect(() => session.advance(1 / 60)).toThrow(/must be synchronous/); await Promise.resolve(); session.dispose();
  });
  it("bounds events and reclaims capacity across repeated sessions without stale delivery", () => {
    for (let run = 0; run < 100; run++) {
      const session = createUiSession(), screen = session.port.create("hud", document()); session.setEnabled(true);
      const callback = vi.fn(); screen.on("add", callback);
      for (let event = 0; event < 256; event++) session.dispatch("hud", "add");
      expect(() => session.dispatch("hud", "add")).toThrow(/capacity/);
      screen.tween("score", { x: 100 }, { duration: 1 }); session.dispose(); session.advance(0.1);
      expect(callback).not.toHaveBeenCalled(); expect(session.stats()).toEqual({ screens: 0, nodes: 0, tweens: 0, events: 0, listeners: 0, observers: 0 });
    }
  });
});
