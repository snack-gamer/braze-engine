import { describe, expect, it } from "vitest";
import { BUILTIN_DOCK_LAYOUTS, builtinDockLayout } from "./layout-presets";
import { DEFAULT_DOCK_DOCUMENT, findPaneGroup, parseDockDocument } from "./layout";

describe("editor layout presets", () => {
  it("keeps every built-in preset valid and self-contained", () => {
    for (const preset of BUILTIN_DOCK_LAYOUTS) {
      expect(parseDockDocument(preset.document), preset.name).toEqual(preset.document);
    }
  });

  it("returns defensive copies without mutating the default layout", () => {
    const first = builtinDockLayout("default");
    const second = builtinDockLayout("default");
    expect(first).toEqual(DEFAULT_DOCK_DOCUMENT);
    expect(first).not.toBe(second);
    expect(first.root).not.toBe(second.root);
  });

  it("opens Animation in the animation workspace preset", () => {
    const animation = builtinDockLayout("animation");
    const group = findPaneGroup(animation.root, "animation");
    expect(group).not.toBeNull();
    expect(group?.active).toBe("animation");
    expect(animation.closed).not.toContain("animation");
  });

  it("keeps Scene visible above Behavior Map in the authoring preset", () => {
    const animator = builtinDockLayout("animator");
    expect(findPaneGroup(animator.root, "scene")?.active).toBe("scene");
    expect(findPaneGroup(animator.root, "animator")).toMatchObject({
      id: "project-group",
      active: "animator",
    });
    expect(animator.closed).not.toContain("animator");
  });
});
