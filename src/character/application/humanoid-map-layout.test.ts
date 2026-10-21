import { describe, expect, it } from "vitest";
import { HUMANOID_MAP_LAYOUTS, HUMANOID_REGION_SLOTS, type HumanoidMappingRegion } from "./humanoid-map-layout";

describe("Humanoid map artwork registration", () => {
  it.each(["body", "head", "leftHand", "rightHand"] as const)(
    "provides exactly one interactive point for every %s assignment",
    (region) => {
      expect(HUMANOID_MAP_LAYOUTS[region].points.map((point) => point.bone).sort())
        .toEqual([...HUMANOID_REGION_SLOTS[region]].sort());
    },
  );

  it("mirrors finger controls across the registered right-side artwork axis", () => {
    const left = pointCoordinates("leftHand");
    const right = pointCoordinates("rightHand");
    for (const [leftBone, leftPoint] of left) {
      const rightBone = `right${leftBone.slice("left".length)}`;
      const rightPoint = right.get(rightBone);
      expect(rightPoint).toBeDefined();
      expect(leftPoint.x + rightPoint!.x).toBe(622);
      expect(leftPoint.y).toBe(rightPoint!.y);
    }
  });

  it("registers paired body controls symmetrically on the authored figure", () => {
    const body = pointCoordinates("body");
    for (const [leftBone, leftPoint] of body) {
      if (!leftBone.startsWith("left")) continue;
      const rightBone = `right${leftBone.slice("left".length)}`;
      const rightPoint = body.get(rightBone);
      expect(rightPoint, rightBone).toBeDefined();
      expect(leftPoint.x + rightPoint!.x, rightBone).toBe(622);
      expect(leftPoint.y, rightBone).toBe(rightPoint!.y);
    }
  });

  it("keeps body controls visually separate at their rendered sizes", () => {
    const points = HUMANOID_MAP_LAYOUTS.body.points;
    for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
      const left = points[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
        const right = points[rightIndex]!;
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        const minimum = ((left.markerSize ?? 40) + (right.markerSize ?? 40)) / 2;
        expect(distance, `${left.bone} overlaps ${right.bone}`).toBeGreaterThanOrEqual(minimum);
      }
    }
  });
});

function pointCoordinates(region: HumanoidMappingRegion): Map<string, Readonly<{ x: number; y: number }>> {
  return new Map(HUMANOID_MAP_LAYOUTS[region].points.map((point) => [point.bone, point]));
}
