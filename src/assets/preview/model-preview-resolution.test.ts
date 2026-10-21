import { describe, expect, it } from "vitest";
import { resolveModelPreviewResolution } from "./model-preview-resolution";

describe("model preview render resolution", () => {
  it("caps high-density displays while preserving the CSS aspect", () => {
    expect(resolveModelPreviewResolution(512, 352, 2)).toEqual({
      cssWidth: 512,
      cssHeight: 352,
      pixelRatio: 1.5,
      aspect: 512 / 352,
    });
  });

  it("bounds the drawing buffer after an unusually large dock resize", () => {
    const result = resolveModelPreviewResolution(2560, 1440, 2);
    expect(result.cssWidth * result.pixelRatio).toBeLessThanOrEqual(1024);
    expect(result.cssHeight * result.pixelRatio).toBeLessThanOrEqual(1024);
    expect(result.aspect).toBeCloseTo(16 / 9);
  });

  it("normalizes hidden or malformed measurements", () => {
    expect(resolveModelPreviewResolution(0, Number.NaN, Number.NaN)).toEqual({
      cssWidth: 1,
      cssHeight: 1,
      pixelRatio: 1,
      aspect: 1,
    });
  });
});
