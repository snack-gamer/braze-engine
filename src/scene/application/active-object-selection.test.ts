import { describe, expect, it } from "vitest";
import type { SceneObject } from "../../types";
import { defaultActiveSceneObjectId } from "./active-object-selection";

function object(id: string, primitive: SceneObject["primitive"]): SceneObject {
  return {
    id,
    name: id,
    primitive,
    color: "#fff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

describe("default active scene object", () => {
  it("prefers authored scene content over cameras and default lighting", () => {
    expect(defaultActiveSceneObjectId([
      object("camera", "camera"),
      object("light", "directionalLight"),
      object("mesh", "fbx"),
    ])).toBe("mesh");
  });

  it("uses a utility object only when the scene has no content", () => {
    expect(defaultActiveSceneObjectId([object("light", "directionalLight")])).toBe("light");
    expect(defaultActiveSceneObjectId([])).toBe("");
  });
});
