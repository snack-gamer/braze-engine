import { describe, expect, it } from "vitest";
import { DEFAULT_SKY_SETTINGS } from "./sky-presets";
import {
  DEFAULT_CLOUD_SETTINGS,
  formatAssetSize,
  skyEditorTabIds,
  skyEditorTabs,
} from "./world-editor-model";

describe("world editor model", () => {
  it("keeps direct-light authoring out of Sky and exposes every visual section", () => {
    expect(skyEditorTabIds()).toEqual(["atmosphere", "clouds", "fog", "postfx", "galaxy"]);
    expect(skyEditorTabs().some((tab) => tab.label === "Sun")).toBe(false);
  });

  it("builds the cloud reset patch from the authoritative defaults", () => {
    expect(DEFAULT_CLOUD_SETTINGS.cloudsCoverage).toBe(0.39);
    expect(DEFAULT_CLOUD_SETTINGS.cloudsShadowDetail).toBe(DEFAULT_SKY_SETTINGS.cloudsShadowDetail);
    expect(Object.keys(DEFAULT_CLOUD_SETTINGS)).toHaveLength(19);
  });

  it("formats HDRI library sizes at the existing unit boundaries", () => {
    expect(formatAssetSize(900)).toBe("900 B");
    expect(formatAssetSize(1_500)).toBe("1 KB");
    expect(formatAssetSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
