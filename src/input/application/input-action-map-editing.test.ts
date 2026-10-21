import { describe, expect, it } from "vitest";
import { EMPTY_INPUT_MAP, INPUT_LIMITS, type InputActionMap } from "../domain/action-map";
import { decodeInputActionMap } from "../serialization/action-map-codec";
import { appendInputAction, changeInputActionKind, defaultInputBinding } from "./input-action-map-editing";

describe("Input Action Map authoring", () => {
  it("generates non-colliding bounded actions without mutating the canonical document", () => {
    let map: InputActionMap = EMPTY_INPUT_MAP;
    for (let index = 0; index < INPUT_LIMITS.actions; index++) map = appendInputAction(map);
    expect(map.actions.length).toBe(INPUT_LIMITS.actions);
    expect(new Set(map.actions.map((action) => action.name)).size).toBe(INPUT_LIMITS.actions);
    expect(appendInputAction(map)).toBe(map);
    expect(EMPTY_INPUT_MAP.actions).toEqual([]);
    expect(decodeInputActionMap(map)).toEqual(map);
  });
  it("device defaults satisfy the shared persisted contract", () => {
    const bindings = (["keyboard", "pointer-button", "pointer-delta", "gamepad-button", "gamepad-axis"] as const)
      .map(defaultInputBinding);
    expect(decodeInputActionMap({ version: 1, actions: [{ name: "Look", kind: "delta", bindings }] }).actions[0].bindings).toHaveLength(5);
  });
  it("kind changes remove incompatible pointer motion while preserving other bindings", () => {
    const keyboard = defaultInputBinding("keyboard"), pointer = defaultInputBinding("pointer-delta");
    const action = { name: "Look", kind: "delta" as const, bindings: [keyboard, pointer] };
    expect(changeInputActionKind(action, "axis").bindings).toEqual([keyboard]);
    expect(action.bindings).toEqual([keyboard, pointer]);
    expect(changeInputActionKind(action, "delta").bindings).toBe(action.bindings);
  });
});
