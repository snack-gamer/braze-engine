import { describe, expect, it } from "vitest";
import { decodeInputActionMapAsset, encodeInputActionMapAsset } from "./input-action-map-asset-codec";

const document = () => ({ version: "braze/input-action-map-v1", name: " Controls ", map: { version: 1,
  actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "KeyJ" }] }] } });

describe("Input Action Map asset codec", () => {
  it("normalizes and deeply captures authored controls without retaining draft references", () => {
    const draft = document(), captured = decodeInputActionMapAsset(draft);
    draft.map.actions[0].bindings[0].code = "KeyK";
    expect(captured.name).toBe("Controls");
    expect(captured.map.actions[0].bindings[0]).toEqual({ device: "keyboard", code: "KeyJ", scale: 1 });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.map.actions[0].bindings[0])).toBe(true);
    expect(decodeInputActionMapAsset(JSON.parse(JSON.stringify(encodeInputActionMapAsset(captured))))).toEqual(captured);
  });
  it.each([null, { ...document(), version: "braze/input-action-map-v2" }, { ...document(), name: " " },
    { ...document(), name: "bad\nname" }, { ...document(), name: "x".repeat(129) },
    { ...document(), map: { version: 1, actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code: "bad code" }] }] } },
  ])("rejects malformed assets at the authored boundary %#", (value) => expect(() => decodeInputActionMapAsset(value)).toThrow());
});
