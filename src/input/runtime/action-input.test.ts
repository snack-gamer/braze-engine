import { describe, expect, it } from "vitest";
import type { InputActionMap } from "../domain/action-map";
import { createActionInput } from "./action-input";

const map: InputActionMap = { version: 1, actions: [
  { name: "move", kind: "axis", bindings: [{ device: "keyboard", code: "KeyA", scale: -1 }, { device: "keyboard", code: "KeyD" }, { device: "gamepad-axis", axis: 0 }] },
  { name: "jump", kind: "button", bindings: [{ device: "keyboard", code: "Space" }, { device: "gamepad-button", button: 0 }] },
  { name: "look", kind: "delta", bindings: [{ device: "pointer-delta", axis: "x", scale: 0.5 }] },
] };

describe("game action input", () => {
  it("retains a tap until a tick and consumes its edges exactly once", () => {
    const input = createActionInput(map);
    input.key("Space", true); input.key("Space", false);
    expect(input.action("jump").pressed).toBe(false);
    input.advance();
    expect(input.action("jump")).toEqual({ value: 0, held: false, pressed: true, released: true });
    input.advance();
    expect(input.action("jump")).toEqual({ value: 0, held: false, pressed: false, released: false });
  });
  it("does not repeat held or autorepeated presses over catch-up ticks", () => {
    const input = createActionInput(map);
    input.key("Space", true); input.advance();
    expect(input.action("jump").pressed).toBe(true);
    input.key("Space", true); input.advance();
    expect(input.action("jump")).toMatchObject({ held: true, pressed: false });
    input.key("Space", false); input.advance();
    expect(input.action("jump").released).toBe(true);
  });
  it("cancels opposite keys, filters gamepad drift and clears disconnected pads", () => {
    const input = createActionInput(map);
    input.key("KeyA", true); input.key("KeyD", true); input.advance([{ axes: [0.1], buttons: [] }]);
    expect(input.action("move").value).toBe(0);
    input.advance([{ axes: [1], buttons: [1] }]);
    expect(input.action("move").value).toBe(1);
    expect(input.action("jump").pressed).toBe(true);
    input.advance();
    expect(input.action("move").value).toBe(0);
    expect(input.action("jump").released).toBe(true);
  });
  it("consumes pointer deltas once, handles nonfinite device values, and resets all state", () => {
    const input = createActionInput(map);
    input.pointer(10, 0); input.pointer(4, 0); input.advance([{ axes: [NaN], buttons: [Infinity] }]);
    expect(input.action("look").value).toBe(7);
    expect(input.action("move").value).toBe(0);
    input.advance(); expect(input.action("look").value).toBe(0);
    input.key("Space", true); input.reset(); input.advance();
    expect(input.action("jump").pressed).toBe(false);
  });
  it("validates replacement atomically and stops responding to old bindings", () => {
    const input = createActionInput(map);
    const original = input.bindings();
    expect(() => input.rebind("jump", [{ device: "gamepad-button", button: -1 }])).toThrow();
    expect(input.bindings()).toBe(original);
    input.key("Space", true);
    input.rebind("jump", [{ device: "keyboard", code: "KeyJ" }]);
    input.advance(); expect(input.action("jump").held).toBe(false);
    input.key("KeyJ", true); input.advance(); expect(input.action("jump").pressed).toBe(true);
  });
});
