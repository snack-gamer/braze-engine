import { describe, expect, it } from "vitest";
import { groundPlacementFromViewport } from "./viewport-placement";

const rect = { left: 100, top: 50, width: 800, height: 600 };
const camera = {
  position: [0, 10, 10] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  fov: 60,
};

describe("groundPlacementFromViewport", () => {
  it("places a center drop at the camera target on the ground", () => {
    const point = groundPlacementFromViewport({
      clientX: 500,
      clientY: 350,
      rect,
      camera,
      near: 0.1,
      far: 1_000,
    });

    expect(point).not.toBeNull();
    expect(point?.[0]).toBeCloseTo(0, 5);
    expect(point?.[1]).toBeCloseTo(0, 5);
    expect(point?.[2]).toBeCloseTo(0, 5);
  });

  it("preserves the left/right direction of a drop", () => {
    const left = groundPlacementFromViewport({
      clientX: 300,
      clientY: 350,
      rect,
      camera,
      near: 0.1,
      far: 1_000,
    });
    const right = groundPlacementFromViewport({
      clientX: 700,
      clientY: 350,
      rect,
      camera,
      near: 0.1,
      far: 1_000,
    });

    expect(left?.[0]).toBeLessThan(0);
    expect(right?.[0]).toBeGreaterThan(0);
  });

  it("returns null when the viewport cannot be projected", () => {
    expect(groundPlacementFromViewport({
      clientX: 0,
      clientY: 0,
      rect: { left: 0, top: 0, width: 0, height: 0 },
      camera,
      near: 0.1,
      far: 1_000,
    })).toBeNull();
  });
});
