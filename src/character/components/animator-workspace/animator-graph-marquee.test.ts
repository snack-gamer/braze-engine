import { describe, expect, it } from "vitest";
import type { AnimatorGraphNode } from "../../application/animator-graph-model";
import { animatorClipIdsInMarquee } from "./animator-graph-marquee";

const nodes: AnimatorGraphNode[] = [
  { id: "entry", kind: "entry", label: "Entry", subtitle: "entry", x: 20, y: 20, defaultState: false },
  { id: "state:a", kind: "state", label: "A", subtitle: "Clip", x: 100, y: 100, stateId: "a", defaultState: true },
  { id: "state:b", kind: "state", label: "B", subtitle: "Clip", x: 360, y: 100, stateId: "b", defaultState: false },
];

describe("Animator graph marquee", () => {
  it("selects only Clip nodes overlapping the screen-space marquee", () => {
    expect(animatorClipIdsInMarquee(nodes, {
      left: 140,
      top: 90,
      width: 390,
      height: 100,
      additive: false,
    }, { x: 40, y: -10, scale: 1.25 })).toEqual(["a", "b"]);
  });

  it("accounts for zoom and ignores Entry", () => {
    expect(animatorClipIdsInMarquee(nodes, {
      left: 0,
      top: 0,
      width: 60,
      height: 60,
      additive: false,
    }, { x: 0, y: 0, scale: 1 })).toEqual([]);
  });
});
