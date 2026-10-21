import { describe, expect, it } from "vitest";
import { resolveEditorSelectionStatus } from "./editor-selection-status";
import type { SceneObject } from "../../types";

const object = {
  id: "hero",
  name: "Hero",
  primitive: "cube",
  color: "#ffffff",
  visible: true,
  locked: false,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
} satisfies SceneObject;

const base = {
  focusedAsset: null,
  selectedMaterial: null,
  inspectorTarget: "object" as const,
  activeObject: object,
  editingCollider: false,
  selectedModifierPin: false,
};

describe("editor selection status", () => {
  it("prioritizes explicit settings and project selections over the scene object", () => {
    expect(resolveEditorSelectionStatus({ ...base, inspectorTarget: "physics" })).toEqual({
      label: "Physics Settings",
      detail: "Project settings",
    });
    expect(resolveEditorSelectionStatus({
      ...base,
      selectedMaterial: { id: "mat", name: "Armor" } as never,
    })).toEqual({ label: "Armor", detail: "Material" });
  });

  it("names imported sub-assets without losing their parent asset context", () => {
    expect(resolveEditorSelectionStatus({
      ...base,
      focusedAsset: {
        kind: "model",
        localId: "mesh:body",
        asset: {
          name: "Hero.fbx",
          subAssets: [{ localId: "mesh:body", kind: "meshFilter", name: "Body" }],
        } as never,
      },
    })).toEqual({ label: "Body", detail: "Mesh Filter · Hero.fbx" });
  });

  it("identifies prefab and focused editing contexts", () => {
    expect(resolveEditorSelectionStatus({ ...base, prefabName: "Hero" })).toEqual({
      label: "Hero",
      detail: "Cube · Hero Prefab",
    });
    expect(resolveEditorSelectionStatus({ ...base, editingCollider: true })).toEqual({
      label: "Hero",
      detail: "Collider edit",
    });
  });
});
