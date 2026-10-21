import { describe, expect, it } from "vitest";
import { characterAssetHistoryCommand } from "./character-assets-keyboard";

describe("Character asset history keyboard routing", () => {
  it.each([
    ["z", true, false, false, "undo"],
    ["z", false, true, false, "undo"],
    ["z", true, false, true, "redo"],
    ["y", false, true, false, "redo"],
  ] as const)("routes %s to the panel history", (key, metaKey, ctrlKey, shiftKey, expected) => {
    expect(characterAssetHistoryCommand(event({ key, metaKey, ctrlKey, shiftKey }))).toBe(expected);
  });

  it.each(["INPUT", "TEXTAREA", "SELECT"])("leaves %s undo to the native control", (tagName) => {
    expect(characterAssetHistoryCommand(event({
      key: "z",
      ctrlKey: true,
      target: { tagName, isContentEditable: false } as unknown as EventTarget,
    }))).toBeNull();
  });

  it("leaves contenteditable undo native and ignores unrelated modifiers", () => {
    expect(characterAssetHistoryCommand(event({
      key: "z",
      metaKey: true,
      target: { isContentEditable: true } as unknown as EventTarget,
    }))).toBeNull();
    expect(characterAssetHistoryCommand(event({ key: "z", altKey: true, ctrlKey: true }))).toBeNull();
    expect(characterAssetHistoryCommand(event({ key: "d", ctrlKey: true }))).toBeNull();
  });
});

function event(
  patch: Partial<Parameters<typeof characterAssetHistoryCommand>[0]> = {},
): Parameters<typeof characterAssetHistoryCommand>[0] {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { tagName: "BUTTON", isContentEditable: false } as unknown as EventTarget,
    ...patch,
  };
}
