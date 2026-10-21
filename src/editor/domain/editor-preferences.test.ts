import { describe, expect, it } from "vitest";
import { defaultEditorPrefs } from "./editor-preference-defaults";
import { restoreEditorPreferences } from "./editor-preferences";

describe("editor grid preference upgrade", () => {
  const oldGrid = { gridColor: "#536061", gridOpacity: 0.25, gridHorizon: 18 };
  it("upgrades stock appearance without changing visibility or other preferences", () => {
    const stored = { ...oldGrid, showGrid: false, translationSnap: 3 };
    const prefs = restoreEditorPreferences(stored, defaultEditorPrefs);
    expect(prefs).toMatchObject({ gridColor: defaultEditorPrefs.gridColor, gridOpacity: defaultEditorPrefs.gridOpacity,
      gridHorizon: defaultEditorPrefs.gridHorizon, showGrid: false, translationSnap: 3 });
    expect(stored.gridOpacity).toBe(0.25);
    expect(restoreEditorPreferences(prefs, defaultEditorPrefs)).toEqual(prefs);
  });
  it("preserves custom values, including a fully transparent grid", () => {
    for (const patch of [{ gridOpacity: 0 }, { gridColor: "#aabbcc" }, { gridHorizon: 50 }]) {
      const stored = { ...oldGrid, ...patch };
      expect(restoreEditorPreferences(stored, defaultEditorPrefs)).toMatchObject(stored);
    }
  });
});
