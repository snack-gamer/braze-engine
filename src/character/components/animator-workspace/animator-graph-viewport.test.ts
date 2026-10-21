import { describe, expect, it } from "vitest";
import {
  ANIMATOR_GRAPH_VIEWPORT_DEFAULT,
  ANIMATOR_GRAPH_VIEWPORT_MAX_SCALE,
  animatorGraphClientPointToWorld,
  animatorGraphGridOffset,
  animatorGraphWorldTransform,
  fitAnimatorGraphViewport,
  panAnimatorGraphViewport,
  zoomAnimatorGraphViewport,
} from "./animator-graph-viewport";

describe("animator graph viewport", () => {
  it("keeps graph text out of a transformed layer at the native view", () => {
    expect(animatorGraphWorldTransform(ANIMATOR_GRAPH_VIEWPORT_DEFAULT)).toBeUndefined();
  });

  it("projects panned and zoomed views with a two-dimensional transform", () => {
    expect(animatorGraphWorldTransform({ x: 12.5, y: -8, scale: 1.15 }))
      .toBe("translate(12.5px, -8px) scale(1.15)");
  });

  it("pans freely in both axes", () => {
    expect(panAnimatorGraphViewport({ x: 20, y: -10, scale: 1 }, { x: -45, y: 70 }))
      .toEqual({ x: -25, y: 60, scale: 1 });
  });

  it("keeps the world point under the zoom anchor stationary", () => {
    const next = zoomAnimatorGraphViewport({ x: 10, y: 20, scale: 1 }, 1.5, { x: 110, y: 120 });
    expect(next).toEqual({ x: -40, y: -30, scale: 1.5 });
  });

  it("maps a client drop point through the current pan and zoom", () => {
    expect(animatorGraphClientPointToWorld(
      { x: -40, y: 30, scale: 2 },
      { x: 410, y: 250 },
      { x: 50, y: 20 },
    )).toEqual({ x: 200, y: 100 });
  });

  it("clamps zoom and frames graph bounds inside the viewport", () => {
    expect(zoomAnimatorGraphViewport({ x: 0, y: 0, scale: 1 }, 20, { x: 0, y: 0 }).scale)
      .toBe(ANIMATOR_GRAPH_VIEWPORT_MAX_SCALE);
    expect(fitAnimatorGraphViewport(
      { x: 0, y: 0, width: 1000, height: 500 },
      { width: 600, height: 400 },
      50,
    )).toEqual({ x: 50, y: 75, scale: 0.5 });
  });

  it("wraps grid origins for positive and negative pan offsets", () => {
    expect(animatorGraphGridOffset(47, 20)).toBe(7);
    expect(animatorGraphGridOffset(-7, 20)).toBe(13);
  });
});
