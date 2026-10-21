import { describe, expect, it } from "vitest";
import type { SceneObject } from "../types";
import { hierarchyComponentIndicators, hierarchyObjectTone } from "./hierarchy-presentation";

function object(patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id: "mesh",
    name: "Mesh",
    primitive: "fbx",
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

describe("hierarchy presentation", () => {
  it("presents behavior counts and disabled state from the shared component registration", () => {
    const base = { id: "one", type: "demo.counter", typeVersion: 1, enabled: false, values: {} };
    const indicator = (enabled: boolean) => hierarchyComponentIndicators(object({
      behaviors: { version: 1, entries: [base, { ...base, id: "two", enabled }] },
    })).find((item) => item.id === "behaviors");
    expect(indicator(false)).toMatchObject({ label: "Behaviors", count: 2, icon: "behaviors", enabled: false });
    expect(indicator(true)?.enabled).toBe(true);
    expect(hierarchyComponentIndicators(object({ behaviors: { version: 1, entries: [], unavailable: { message: "Future version", source: {} } } }))
      .find((item) => item.id === "behaviors")).toMatchObject({ enabled: false });
  });

  it("derives installed component indicators from one data registry", () => {
    const indicators = hierarchyComponentIndicators(object({
      animationPlayer: { enabled: false },
      colliders: [
        { id: "one", enabled: true, shape: "box", center: [0, 0, 0], size: [1, 1, 1], radius: 0.5, length: 1, majorRadius: 1, minorRadius: 0.25, friction: 0.5, showGizmo: true },
        { id: "two", enabled: false, shape: "sphere", center: [0, 0, 0], size: [1, 1, 1], radius: 0.5, length: 1, majorRadius: 1, minorRadius: 0.25, friction: 0.5, showGizmo: true },
      ],
    }));

    expect(indicators.map(({ id }) => id)).toEqual([
      "meshFilter",
      "meshRenderer",
      "animationPlayer",
      "collider",
    ]);
    expect(indicators.find(({ id }) => id === "animationPlayer")?.enabled).toBe(false);
    expect(indicators.find(({ id }) => id === "collider")?.count).toBe(2);
    expect(indicators.map(({ tone }) => tone)).toEqual(["mesh", "mesh", "animation", "physics"]);
  });

  it("colors object glyphs by group and leaves only empties neutral", () => {
    const tone = (patch: Partial<SceneObject>, prefabRoot = false) =>
      hierarchyObjectTone({ object: object(patch), prefabRoot });
    expect(tone({ primitive: "cube" })).toBe("mesh");
    expect(tone({ primitive: "sphere" })).toBe("mesh");
    expect(tone({ primitive: "transform" })).toBe("neutral");
    expect(tone({ primitive: "fbx" })).toBe("prefab");
    expect(tone({ primitive: "cube" }, true)).toBe("prefab");
    expect(tone({ primitive: "camera" })).toBe("rendering");
    expect(tone({ primitive: "directionalLight" })).toBe("lighting");
  });

  it("does not advertise explicitly removed intrinsic components", () => {
    expect(hierarchyComponentIndicators(object({ removedComponents: ["meshRenderer"] }))
      .map(({ id }) => id)).toEqual(["meshFilter"]);
  });
});
