import { describe, expect, it } from "vitest";
import { evaluateBlendTree2d } from "./blend-tree-2d";

describe("2D blend-tree evaluation", () => {
  it("handles center, radial, angular, and exact directional boundaries", () => {
    const children = [
      { motionId: "idle", position: [0, 0] as const },
      { motionId: "right", position: [1, 0] as const },
      { motionId: "up", position: [0, 1] as const },
    ];
    expect(evaluateBlendTree2d("2dSimpleDirectional", children, 0, 0).value).toEqual([
      { motionId: "idle", weight: 1 },
    ]);
    expect(evaluateBlendTree2d("2dSimpleDirectional", children, 0.5, 0).value).toEqual([
      { motionId: "idle", weight: 0.5 },
      { motionId: "right", weight: 0.5 },
    ]);
    expect(evaluateBlendTree2d(
      "2dSimpleDirectional",
      children,
      Math.SQRT1_2,
      Math.SQRT1_2,
    ).value).toEqual([
      { motionId: "right", weight: 0.5 },
      { motionId: "up", weight: 0.5 },
    ]);
    expect(evaluateBlendTree2d("2dSimpleDirectional", children, 0, 2).value).toEqual([
      { motionId: "up", weight: 1 },
    ]);
  });

  it("interpolates magnitudes in a Freeform Directional ray", () => {
    const result = evaluateBlendTree2d("2dFreeformDirectional", [
      { motionId: "idle", position: [0, 0] },
      { motionId: "walk", position: [1, 0] },
      { motionId: "run", position: [2, 0] },
    ], 1.5, 0);
    expect(result.value).toEqual([
      { motionId: "walk", weight: 0.5 },
      { motionId: "run", weight: 0.5 },
    ]);
  });

  it("interpolates a Cartesian center and snaps to an authored point", () => {
    const children = [
      { motionId: "bottomLeft", position: [-1, -1] as const },
      { motionId: "bottomRight", position: [1, -1] as const },
      { motionId: "topLeft", position: [-1, 1] as const },
      { motionId: "topRight", position: [1, 1] as const },
    ];
    expect(evaluateBlendTree2d("2dFreeformCartesian", children, 0, 0).value).toEqual([
      { motionId: "bottomLeft", weight: 0.25 },
      { motionId: "bottomRight", weight: 0.25 },
      { motionId: "topLeft", weight: 0.25 },
      { motionId: "topRight", weight: 0.25 },
    ]);
    expect(evaluateBlendTree2d("2dFreeformCartesian", children, 1, 1).value).toEqual([
      { motionId: "topRight", weight: 1 },
    ]);
  });

  it("interpolates deterministically across the signed-angle wrap boundary", () => {
    const degrees = (value: number) => value * Math.PI / 180;
    const left = [Math.cos(degrees(170)), Math.sin(degrees(170))] as const;
    const right = [Math.cos(degrees(-170)), Math.sin(degrees(-170))] as const;
    const result = evaluateBlendTree2d("2dSimpleDirectional", [
      { motionId: "left", position: left },
      { motionId: "right", position: right },
    ], -1, 0);
    expect(result.value?.[0]?.weight).toBeCloseTo(0.5);
    expect(result.value?.[1]?.weight).toBeCloseTo(0.5);
  });

  it("diagnoses duplicate and underconstrained point layouts explicitly", () => {
    const duplicate = evaluateBlendTree2d("2dFreeformCartesian", [
      { motionId: "first", position: [0, 0] },
      { motionId: "second", position: [0, 0] },
    ], 0, 0);
    expect(duplicate.value).toBeNull();
    expect(duplicate.diagnostics.map((item) => item.code)).toContain("duplicate-blend-position");

    const sameDirection = evaluateBlendTree2d("2dSimpleDirectional", [
      { motionId: "walk", position: [1, 0] },
      { motionId: "run", position: [2, 0] },
    ], 1, 0);
    expect(sameDirection.value).toBeNull();
    expect(sameDirection.diagnostics.map((item) => item.code)).toContain("duplicate-simple-direction");

    const missingCenter = evaluateBlendTree2d("2dFreeformDirectional", [
      { motionId: "walk", position: [1, 0] },
      { motionId: "left", position: [0, 1] },
    ], 0.5, 0.5);
    expect(missingCenter.value).toBeNull();
    expect(missingCenter.diagnostics.map((item) => item.code)).toContain("missing-freeform-directional-center");

    const collinear = evaluateBlendTree2d("2dFreeformCartesian", [
      { motionId: "left", position: [-1, 0] },
      { motionId: "center", position: [0, 0] },
      { motionId: "right", position: [1, 0] },
    ], 0.5, 0);
    expect(collinear.value).not.toBeNull();
    expect(collinear.diagnostics.map((item) => item.code)).toContain("collinear-2d-blend-layout");
  });
});
