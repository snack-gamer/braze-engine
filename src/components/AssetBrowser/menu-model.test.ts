import { describe, expect, it } from "vitest";
import { menuItemsFor } from "./menu-model";

describe("Project asset menu model", () => {
  it("registers input creation in Input and exposes source lifecycle actions", () => {
    const items = menuItemsFor({ kind: "empty", x: 0, y: 0 }, 0);
    expect(items.find((item) => item.action === "new-input-action-map"))
      .toMatchObject({ label: "Input Action Map", section: "Input", icon: "assetInput" });
    expect(menuItemsFor({ kind: "item", x: 0, y: 0, itemKind: "inputActionMap", id: "Controls.braze-input.json", name: "Controls" }, 1)
      .map((item) => item.action)).toEqual(["open", "rename", "duplicate", "reveal", "toggle-favorite", "delete"]);
  });
  it("routes scene documents through their own supported commands", () => {
    const menu = { kind: "item" as const, x: 0, y: 0, itemKind: "scene" as const, id: "scene-a", name: "A" };
    expect(menuItemsFor(menu, 1).map((item) => item.action)).toEqual(["open", "toggle-favorite", "delete"]);
    expect(menuItemsFor({ ...menu, activeScene: true }, 1).map((item) => item.action))
      .toEqual(["open", "rename", "save-scene-copy", "toggle-favorite", "delete"]);
  });
  it("creates only reusable character assets from the current Project destination", () => {
    const items = menuItemsFor({ kind: "empty", x: 0, y: 0 }, 0);
    const actions = items.map((item) => item.action);
    expect(actions).not.toContain("new-animator-controller");
    expect(actions).not.toContain("save-scene-copy");
    expect(actions).toContain("new-avatar-mask");
    expect(items.find((item) => item.action === "new-avatar-mask")?.section)
      .toBe("Animation");
    expect(items.find((item) => item.action === "import-model")?.section)
      .toBe("Import");
  });

  it("uses authored-asset actions without disk-only reveal and preview commands", () => {
    const actions = menuItemsFor({
      kind: "item",
      x: 0,
      y: 0,
      itemKind: "avatarMask",
      id: "mask-id",
      name: "Upper Body",
    }, 1).map((item) => item.action);
    expect(actions).toEqual(["open", "rename", "duplicate", "toggle-favorite", "delete"]);
  });
});
