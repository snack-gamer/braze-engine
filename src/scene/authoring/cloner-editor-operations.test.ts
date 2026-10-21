import { describe, expect, it } from "vitest";
import { defaultClonerSettings } from "../../lib/cloner";
import type { SceneObject } from "../domain/scene-object";
import {
  clonerCloneCount,
  clonerEffectorIds,
  clonerInputCandidates,
  clonerSourceCount,
  moveClonerEffector,
  patchClonerVector,
  uniformClonerVector,
} from "./cloner-editor-operations";

const object = (id: string, primitive: SceneObject["primitive"] = "transform", parentId?: string): SceneObject => ({
  id, parentId, name: id, primitive, color: "#fff", visible: true, locked: false,
  position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
});

describe("cloner editor operations", () => {
  it("reports exact grid and stepped radial clone totals", () => {
    expect(clonerCloneCount({ ...defaultClonerSettings, mode: "grid", gridCount: [2, 3, 4] })).toBe(24);
    expect(clonerCloneCount({
      ...defaultClonerSettings, mode: "radial", count: 5, radialRings: 3, radialCountStep: 2,
    })).toBe(21);
  });

  it("filters source and input candidates using the authored hierarchy rules", () => {
    const objects = [
      object("owner", "cloner"), object("source", "cube", "owner"),
      object("camera", "camera", "owner"), object("other-cloner", "cloner"), object("mesh", "cube"),
    ];
    expect(clonerSourceCount(objects, "owner")).toBe(1);
    expect(clonerInputCandidates(objects, "owner").map((item) => item.id)).toEqual(["source", "mesh"]);
  });

  it("builds immutable vector and uniform patches with integer count clamping", () => {
    expect(patchClonerVector(defaultClonerSettings, "gridCount", 1, 0.4, true)).toEqual({
      gridCount: [5, 1, 5],
    });
    expect(patchClonerVector(defaultClonerSettings, "linearStep", 2, 3)).toEqual({
      linearStep: [1.8, 0, 3],
    });
    expect(uniformClonerVector("jitterScale", 0.5)).toEqual({ jitterScale: [0.5, 0.5, 0.5] });
  });

  it("retains authored effector order and moves only within stack bounds", () => {
    const effectors = [object("a", "effector"), object("mesh", "cube"), object("b", "effector")];
    expect(clonerEffectorIds(effectors, ["b", "missing", "a"]).stack).toEqual(["b", "a"]);
    expect(clonerEffectorIds(effectors, ["b"]).available.map((item) => item.id)).toEqual(["a"]);
    expect(moveClonerEffector(["a", "b"], 1, -1)).toEqual(["b", "a"]);
    expect(moveClonerEffector(["a", "b"], 0, -1)).toBeNull();
  });
});
