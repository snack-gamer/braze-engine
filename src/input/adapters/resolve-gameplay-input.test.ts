import { describe, expect, it } from "vitest";
import type { InputActionMap } from "../domain/action-map";
import { createActionInput } from "../runtime/action-input";
import { resolveGameplayInput } from "./resolve-gameplay-input";

const map = (code: string): InputActionMap => ({ version: 1, actions: [{ name: "fire", kind: "button", bindings: [{ device: "keyboard", code, scale: 1 }] }] });
const capture = () => ({ asset: { guid: "ab000000000000000000000000000001" }, revision: "a".repeat(64),
  document: { version: "braze/input-action-map-v1", name: "Controls", map: map("KeyJ") } });

describe("gameplay input selection", () => {
  it("uses selected assets before module defaults, then inline and empty fallbacks", () => {
    expect(resolveGameplayInput(map("KeyI"), capture())).toEqual(map("KeyJ"));
    expect(resolveGameplayInput(map("KeyI"), undefined)).toEqual(map("KeyI"));
    expect(resolveGameplayInput(undefined, undefined)).toEqual({ version: 1, actions: [] });
  });
  it("captures immutable controls and isolates per-session runtime rebinding", () => {
    const raw = capture(), resolved = resolveGameplayInput(map("KeyI"), raw);
    raw.document.map = map("KeyK");
    const first = createActionInput(resolved), second = createActionInput(resolved);
    first.rebind("fire", [{ device: "keyboard", code: "KeyR" }]);
    expect(resolved).toEqual(map("KeyJ")); expect(second.bindings()).toEqual(map("KeyJ"));
    first.key("KeyJ", true); second.key("KeyJ", true); first.advance(); second.advance();
    expect(first.action("fire").pressed).toBe(false); expect(second.action("fire").pressed).toBe(true);
    first.key("KeyR", true); first.advance(); expect(first.action("fire").pressed).toBe(true);
  });
  it.each([null, {}, { ...capture(), revision: "bad" }, { ...capture(), document: { version: "unknown" } },
  ])("never falls back from a malformed selected map %#", (captured) => expect(() => resolveGameplayInput(map("KeyI"), captured)).toThrow());
});
