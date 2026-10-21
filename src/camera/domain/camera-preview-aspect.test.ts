import { describe, expect, it } from "vitest";
import { resolveCameraPreviewAspect } from "./camera-preview-aspect";

describe("camera preview aspect", () => {
  it("uses the selected Game-view ratio instead of the Scene pane ratio", () => {
    expect(resolveCameraPreviewAspect(3840 / 2160, 0.6)).toBeCloseTo(16 / 9);
    expect(resolveCameraPreviewAspect(1920 / 1080, 2.4)).toBeCloseTo(16 / 9);
  });

  it("keeps Free Aspect fluid with the Scene pane", () => {
    expect(resolveCameraPreviewAspect(null, 0.75)).toBe(0.75);
    expect(resolveCameraPreviewAspect(undefined, 2)).toBe(2);
  });

  it("falls back safely when neither aspect is usable", () => {
    expect(resolveCameraPreviewAspect(Number.NaN, 0)).toBeCloseTo(16 / 9);
  });
});
