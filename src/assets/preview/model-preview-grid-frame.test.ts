import { describe, expect, it } from "vitest";
import { calculateModelPreviewGridFrame } from "./model-preview-grid-frame";

describe("model preview grid framing", () => {
  it("uses readable metric steps for a human-sized asset", () => {
    expect(calculateModelPreviewGridFrame({ minimumY: 0, width: 1.4, height: 2, depth: 0.5 }))
      .toEqual({ size: 4, cellSize: 0.2, groundHeight: -0.001 });
  });

  it("scales cleanly for tiny and large authoring units", () => {
    const tiny = calculateModelPreviewGridFrame({ minimumY: -0.01, width: 0.01, height: 0.02, depth: 0.01 });
    const large = calculateModelPreviewGridFrame({ minimumY: -20, width: 300, height: 50, depth: 200 });
    expect(tiny.cellSize).toBe(0.002);
    expect(tiny.size).toBe(0.04);
    expect(large.cellSize).toBe(50);
    expect(large.size).toBe(1000);
    expect(tiny.groundHeight).toBeLessThan(-0.01);
    expect(large.groundHeight).toBeLessThan(-20);
  });
});
