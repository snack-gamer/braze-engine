import { describe, expect, it } from "vitest";
import { decodeInputActionMap, encodeInputActionMap } from "./action-map-codec";

describe("action map codec", () => {
  it("round-trips and copies authored bindings without mutable references", () => {
    const raw = { version: 1, actions: [{ name: "move", kind: "axis", bindings: [{ device: "keyboard", code: "KeyW" }] }] };
    const value = decodeInputActionMap(raw);
    raw.actions[0].bindings[0].code = "KeyZ";
    expect(value.actions[0].bindings[0]).toMatchObject({ code: "KeyW" });
    expect(decodeInputActionMap(JSON.parse(encodeInputActionMap(value)))).toEqual(value);
    expect(Object.isFrozen(value.actions[0].bindings)).toBe(true);
  });
  it.each([null, { version: 2, actions: [] }, { version: 1, actions: Array(65).fill({}) },
    { version: 1, actions: [{ name: "a", kind: "button", bindings: [{ device: "pointer-delta", axis: "x" }] }] },
    { version: 1, actions: [{ name: "a", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 0, deadzone: 1 }] }] },
    { version: 1, actions: [{ name: "a", kind: "axis", bindings: [{ device: "keyboard", code: "KeyX", scale: NaN }] }] },
    { version: 1, actions: [{ name: "a", kind: "button", bindings: [] }, { name: "a", kind: "button", bindings: [] }] },
  ])("rejects invalid persisted maps %#", (raw) => expect(() => decodeInputActionMap(raw)).toThrow());
});
