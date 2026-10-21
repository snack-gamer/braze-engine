import { describe, expect, it } from "vitest";
import type { AnimatorGraphEdge, AnimatorGraphNode } from "../../application/animator-graph-model";
import {
  animatorGraphConnectionLaneOffsets,
  animatorGraphEdgeGeometry,
  animatorGraphPreviewGeometry,
} from "./animator-graph-edge-geometry";

describe("Animator graph edge geometry", () => {
  it("joins the nearest rectangle boundaries without an S-curve", () => {
    const source = node("source", 200, 0);
    const destination = node("destination", 0, 150);
    const geometry = animatorGraphEdgeGeometry(source, destination);

    expect(geometry.path).toMatch(/^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/);
    expect(geometry.start.y).toBeCloseTo(64);
    expect(geometry.end.y).toBeCloseTo(150);
    expect(geometry.start.x).toBeGreaterThan(source.x);
    expect(geometry.end.x).toBeGreaterThan(destination.x);
    expect(geometry.arrowAngleDegrees).toBeGreaterThan(90);
    expect(geometry.arrowAngleDegrees).toBeLessThan(180);
  });

  it("separates reciprocal transitions into parallel physical lanes", () => {
    const forward = edge("forward", "state:a", "state:b");
    const reverse = edge("reverse", "state:b", "state:a");
    const offsets = animatorGraphConnectionLaneOffsets([forward, reverse]);
    const a = node("state:a", 0, 0);
    const b = node("state:b", 300, 120);
    const forwardGeometry = animatorGraphEdgeGeometry(a, b, offsets.get(forward));
    const reverseGeometry = animatorGraphEdgeGeometry(b, a, offsets.get(reverse));

    expect(forwardGeometry.path).not.toBe(reverseGeometry.path);
    expect(Math.hypot(
      forwardGeometry.midpoint.x - reverseGeometry.midpoint.x,
      forwardGeometry.midpoint.y - reverseGeometry.midpoint.y,
    )).toBeGreaterThan(10);
    expect(Math.abs(forwardGeometry.arrowAngleDegrees - reverseGeometry.arrowAngleDegrees))
      .toBeCloseTo(180);
  });

  it("bounds lane spread when a pair has hundreds of transitions", () => {
    const edges = Array.from({ length: 300 }, (_, index) => (
      edge(`transition-${index}`, "state:a", "state:b")
    ));
    const offsets = [...animatorGraphConnectionLaneOffsets(edges).values()];
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-18);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(18);
    expect(new Set(offsets).size).toBe(edges.length);
  });

  it("keeps a free drag endpoint at the pointer while choosing the nearest source side", () => {
    const source = node("source", 200, 100);
    const pointer = { x: 20, y: 115 };
    const geometry = animatorGraphPreviewGeometry(source, pointer);
    expect(geometry.end).toEqual(pointer);
    expect(geometry.start.x).toBeCloseTo(source.x);
  });
});

function node(id: string, x: number, y: number): AnimatorGraphNode {
  return {
    id,
    kind: "state",
    label: id,
    subtitle: "Clip",
    x,
    y,
    stateId: id,
    defaultState: false,
  };
}

function edge(id: string, sourceNodeId: string, destinationNodeId: string): AnimatorGraphEdge {
  return { id, kind: "transition", sourceNodeId, destinationNodeId };
}
