import { describe, expect, it } from "vitest";
import type { AnimatorMotion } from "../domain/blend-tree";
import {
  addAnimatorBlendChild,
  animatorMotionAtPath,
  createAnimatorMotion,
  moveAnimatorBlendChild,
  patchAnimatorBlendChild,
  patchAnimatorBlendTree,
  patchAnimatorClipMotion,
  removeAnimatorBlendChild,
  replaceAnimatorMotionAtPath,
} from "./animator-motion-authoring";

const CLIP_REF = { guid: "a".repeat(32), localId: "clip:idle" };

function clip(): AnimatorMotion {
  return createAnimatorMotion("clip", { clipRef: CLIP_REF })!;
}

describe("Animator motion authoring", () => {
  it("builds and edits immutable nested 1D and 2D motion graphs", () => {
    const source = createAnimatorMotion("1d", { parameterId: "speed" });
    const withIdle = addAnimatorBlendChild(source, [], { id: "idle", motion: clip() });
    const edited = patchAnimatorBlendChild(withIdle, [], "idle", { threshold: 0.25, timeScale: 1.5 });
    const nested = replaceAnimatorMotionAtPath(edited, ["idle"], "2dFreeformCartesian", {
      parameterId: "x",
      parameterYId: "y",
    });
    const withNestedClip = addAnimatorBlendChild(nested, ["idle"], { id: "diagonal", motion: clip() });
    const movedAxes = patchAnimatorBlendTree(withNestedClip, ["idle"], {
      parameterXId: "horizontal",
      parameterYId: "vertical",
    });
    const positioned = patchAnimatorBlendChild(movedAxes, ["idle"], "diagonal", { position: [0.5, -1] });

    expect(source).toMatchObject({ kind: "blendTree", tree: { children: [] } });
    expect(animatorMotionAtPath(edited, [])).toMatchObject({
      tree: { children: [{ id: "idle", threshold: 0.25, timeScale: 1.5 }] },
    });
    expect(animatorMotionAtPath(positioned, ["idle"])).toMatchObject({
      tree: {
        kind: "2dFreeformCartesian",
        parameterXId: "horizontal",
        parameterYId: "vertical",
        children: [{ id: "diagonal", position: [0.5, -1] }],
      },
    });
  });

  it("edits Direct weights, clip time scaling, ordering, and removal", () => {
    let motion = createAnimatorMotion("direct");
    motion = addAnimatorBlendChild(motion, [], { id: "a", motion: clip(), numericParameterId: "weight-a" });
    motion = addAnimatorBlendChild(motion, [], { id: "b", motion: clip(), numericParameterId: "weight-b" });
    motion = patchAnimatorBlendChild(motion, [], "a", { weightParameterId: "weight-main" });
    motion = patchAnimatorBlendTree(motion, [], { normalizeWeights: false });
    motion = patchAnimatorClipMotion(motion, ["a"], { speed: 2, timeScaleParameterId: "tempo", loopMode: "once" });
    motion = moveAnimatorBlendChild(motion, [], "b", -1);

    expect(motion).toMatchObject({
      tree: {
        normalizeWeights: false,
        children: [
          { id: "b", weightParameterId: "weight-b" },
          { id: "a", weightParameterId: "weight-main", motion: { speed: 2, timeScaleParameterId: "tempo", loopMode: "once" } },
        ],
      },
    });
    expect(removeAnimatorBlendChild(motion, [], "b")).toMatchObject({
      tree: { children: [{ id: "a" }] },
    });
  });

  it("appends a unique 1D threshold after the authored maximum regardless of child order", () => {
    let motion = createAnimatorMotion("1d", { parameterId: "speed" });
    motion = addAnimatorBlendChild(motion, [], { id: "high", motion: clip() });
    motion = patchAnimatorBlendChild(motion, [], "high", { threshold: 4 });
    motion = addAnimatorBlendChild(motion, [], { id: "low", motion: clip() });
    motion = patchAnimatorBlendChild(motion, [], "low", { threshold: -2 });
    motion = addAnimatorBlendChild(motion, [], { id: "next", motion: clip() });

    expect(motion).toMatchObject({
      tree: {
        children: [
          { id: "high", threshold: 4 },
          { id: "low", threshold: -2 },
          { id: "next", threshold: 5 },
        ],
      },
    });
  });

  it("uses a finite unused 1D threshold when adding one cannot advance the maximum", () => {
    let motion = createAnimatorMotion("1d", { parameterId: "speed" });
    motion = addAnimatorBlendChild(motion, [], { id: "maximum", motion: clip() });
    motion = patchAnimatorBlendChild(motion, [], "maximum", { threshold: Number.MAX_VALUE });
    motion = addAnimatorBlendChild(motion, [], { id: "next", motion: clip() });

    expect(motion).toMatchObject({
      tree: {
        children: [
          { id: "maximum", threshold: Number.MAX_VALUE },
          { id: "next", threshold: 0 },
        ],
      },
    });
  });

  it("places 2D samples at deterministic center and cardinal positions without overlaps", () => {
    let motion = createAnimatorMotion("2dSimpleDirectional", {
      parameterId: "horizontal",
      parameterYId: "vertical",
    });
    for (const id of ["center", "forward", "right", "back", "left", "diagonal"]) {
      motion = addAnimatorBlendChild(motion, [], { id, motion: clip() });
    }
    motion = moveAnimatorBlendChild(motion, [], "left", -1);
    motion = addAnimatorBlendChild(motion, [], { id: "next", motion: clip() });

    if (motion?.kind !== "blendTree" || motion.tree.kind !== "2dSimpleDirectional") {
      throw new Error("Expected a 2D Simple Directional blend tree.");
    }
    const positionById = new Map(motion.tree.children.map((child) => [child.id, child.position]));
    expect(positionById).toEqual(new Map([
      ["center", [0, 0]],
      ["forward", [0, 1]],
      ["right", [1, 0]],
      ["back", [0, -1]],
      ["left", [-1, 0]],
      ["diagonal", [1, 1]],
      ["next", [1, -1]],
    ]));
    expect(new Set(motion.tree.children.map((child) => child.position.join(","))).size)
      .toBe(motion.tree.children.length);
  });

  it("continues assigning deterministic unique 2D directions after the initial layout", () => {
    let motion = createAnimatorMotion("2dSimpleDirectional", {
      parameterId: "horizontal",
      parameterYId: "vertical",
    });
    for (let index = 0; index < 12; index += 1) {
      motion = addAnimatorBlendChild(motion, [], { id: `sample-${index}`, motion: clip() });
    }

    if (motion?.kind !== "blendTree" || motion.tree.kind !== "2dSimpleDirectional") {
      throw new Error("Expected a 2D Simple Directional blend tree.");
    }
    expect(motion.tree.children.map((child) => child.position)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
      [-1, 2],
      [1, 2],
      [-2, 1],
    ]);
  });

  it("enforces distinct 2D axes and the runtime-compatible nesting bound", () => {
    expect(() => createAnimatorMotion("2dSimpleDirectional", {
      parameterId: "speed",
      parameterYId: "speed",
    })).toThrow(/different parameters/);

    let motion = createAnimatorMotion("1d", { parameterId: "speed" });
    const path: string[] = [];
    for (let depth = 0; depth < 8; depth += 1) {
      const id = `child-${depth}`;
      motion = addAnimatorBlendChild(motion, path, { id, motion: clip() });
      path.push(id);
      if (depth < 7) motion = replaceAnimatorMotionAtPath(motion, path, "1d", { parameterId: "speed" });
    }
    expect(() => replaceAnimatorMotionAtPath(motion, path, "1d", { parameterId: "speed" }))
      .toThrow(/below depth 8/);
  });
});
