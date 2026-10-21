import { describe, expect, it } from "vitest";
import { seedObjects } from "../testing/scene-objects";
import { createDefaultAnimatorComponent } from "../../character/domain/animator-component";
import { animatorComponentUnavailableReason } from "../authoring/animator-component-eligibility";
import { sceneComponentOperations } from "../authoring/component-registry";
import type { SceneObject } from "../../types";
import {
  inspectorSectionsForObject,
  listSceneComponentAdditions,
  sceneComponentAdditions,
  sceneInspectorSectionDescriptors,
} from "./scene-component-registry";

function fixture(primitive: SceneObject["primitive"] = "cube"): SceneObject {
  const source = seedObjects.find((object) => object.primitive === primitive) ?? seedObjects[3];
  return {
    ...source,
    id: `fixture-${primitive}`,
    primitive,
    position: [...source.position],
    rotation: [...source.rotation],
    scale: [...source.scale],
    water: undefined,
  };
}

function importedModelFixture(
  primitive: "fbx" | "gltf" | "usd" | "usdz" = "gltf",
  filename = `hero.${primitive}`,
): SceneObject {
  return {
    ...fixture(),
    id: `fixture-${primitive}-${filename}`,
    primitive,
    assetRef: { guid: "a".repeat(32), localId: "main" },
    assetUrl: `/3d-models/${filename}`,
    assetMissing: false,
  };
}

describe("scene component registry", () => {
  it("registers reusable behavior authoring for every object type and prevents duplicate component containers", () => {
    for (const primitive of ["cube", "camera", "transform"] as const) {
      const object = fixture(primitive);
      const addition = listSceneComponentAdditions(object, "inspector").find((item) => item.id === "behaviors");
      expect(addition).toMatchObject({ category: "Gameplay", label: "Behaviors", componentIcon: "behaviors", hierarchyIcon: "behaviors" });
      const authored = { ...object, ...addition!.createPatch(object) };
      expect(authored.behaviors).toEqual({ version: 1, entries: [] });
      expect(inspectorSectionsForObject(authored).map((section) => section.id)).toContain("behaviors");
      expect(listSceneComponentAdditions(authored, "inspector").some((item) => item.id === "behaviors")).toBe(false);
    }
  });

  it("joins every authored operation to one unique UI registration", () => {
    const operationIds = sceneComponentOperations.map((operation) => operation.id).sort();
    const additionIds = sceneComponentAdditions.map((addition) => addition.id);
    const sectionIds = sceneInspectorSectionDescriptors.map((section) => section.id);

    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(new Set(additionIds).size).toBe(additionIds.length);
    expect([...additionIds].sort()).toEqual(operationIds);
    expect(sceneComponentAdditions.every((addition) => (
      addition.category.length > 0
      && addition.hierarchyIcon.length > 0
      && addition.componentIcon.length > 0
    ))).toBe(true);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(sceneInspectorSectionDescriptors.map((section) => section.order)).toEqual(
      [...sceneInspectorSectionDescriptors].map((section) => section.order).sort((left, right) => left - right),
    );
  });

  it("preserves the menu-specific availability policy", () => {
    const mesh = { ...fixture(), removedComponents: ["meshFilter", "meshRenderer"] };
    const inspector = listSceneComponentAdditions(mesh, "inspector");
    const hierarchy = listSceneComponentAdditions(mesh, "hierarchy", true);

    expect(inspector
      .filter((addition) => addition.id === "meshFilter" || addition.id === "meshRenderer")
      .map((addition) => addition.id)).toEqual(["meshFilter", "meshRenderer"]);
    expect(sceneComponentAdditions.find((addition) => addition.id === "meshFilter")).toMatchObject({
      hierarchyIcon: "meshFilter",
      componentIcon: "meshFilter",
    });
    expect(inspector.find((addition) => addition.id === "modifier:displacer")?.componentIcon).toBe("modifierTool");
    expect(hierarchy.some((addition) => addition.id === "meshFilter")).toBe(false);
    expect(hierarchy.find((addition) => addition.id === "depthOfField")).toMatchObject({
      enabled: false,
      unavailableReason: "Only cameras can use Depth of Field.",
    });
  });

  it("offers Animator only to imported model roots the playback backend can resolve", () => {
    const supported = [
      importedModelFixture("gltf", "hero.glb"),
      importedModelFixture("gltf", "hero.gltf"),
      importedModelFixture("fbx", "hero.fbx"),
    ];
    for (const object of supported) {
      expect(listSceneComponentAdditions(object, "inspector")
        .some((addition) => addition.id === "animator")).toBe(true);
    }
    for (const primitive of ["usd", "usdz"] as const) {
      expect(animatorComponentUnavailableReason(importedModelFixture(primitive)))
        .toContain("fully analyzed imported FBX, GLB, or glTF");
    }

    const unsupported = listSceneComponentAdditions(fixture(), "inspector", true)
      .find((addition) => addition.id === "animator");
    expect(unsupported).toMatchObject({
      enabled: false,
      unavailableReason: "Animator playback requires a fully analyzed imported FBX, GLB, or glTF model.",
    });
    expect(listSceneComponentAdditions(fixture(), "inspector")
      .some((addition) => addition.id === "animator")).toBe(false);

    expect(animatorComponentUnavailableReason({
      ...importedModelFixture(),
      assetRef: undefined,
    })).toBe("Animator playback requires a durable imported model reference.");
    expect(animatorComponentUnavailableReason({
      ...importedModelFixture(),
      assetRef: { guid: "not-a-guid", localId: "main" },
    })).toBe("Animator playback requires a durable imported model reference.");
    expect(animatorComponentUnavailableReason({
      ...importedModelFixture(),
      assetRef: { guid: "a".repeat(32), localId: "mesh:body" },
    })).toContain("main asset");
    expect(animatorComponentUnavailableReason({
      ...importedModelFixture(),
      assetUrl: undefined,
    })).toBe("Animator playback requires an available imported model source.");
    expect(animatorComponentUnavailableReason({
      ...importedModelFixture(),
      assetMissing: true,
    })).toBe("Animator playback requires an available imported model source.");
    expect(animatorComponentUnavailableReason(importedModelFixture(), {
      ready: false,
      importedAssets: [],
    })).toContain("still loading");
    expect(animatorComponentUnavailableReason(importedModelFixture(), {
      ready: true,
      importedAssets: [],
    })).toContain("ready Asset Database catalog");
    expect(animatorComponentUnavailableReason(importedModelFixture(), {
      ready: true,
      importedAssets: [{
        guid: "a".repeat(32),
        kind: "model",
        status: "ready",
        filename: "hero.glb",
      }],
    })).toBeUndefined();
    expect(animatorComponentUnavailableReason(importedModelFixture("fbx", "hero.fbx"), {
      ready: true,
      importedAssets: [{
        guid: "a".repeat(32),
        kind: "model",
        status: "dirty",
        filename: "hero.fbx",
        subAssets: [
          { kind: "avatar", localId: "avatar:hero" },
          { kind: "clip", localId: "clip:idle" },
        ],
      }],
    })).toBeUndefined();
    expect(animatorComponentUnavailableReason(importedModelFixture("fbx", "hero.fbx"), {
      ready: true,
      importedAssets: [{
        guid: "a".repeat(32),
        kind: "model",
        status: "ready",
        filename: "hero.fbx",
        subAssets: [{ kind: "model", localId: "main" }],
      }],
    })).toBeUndefined();
    expect(animatorComponentUnavailableReason(importedModelFixture(), {
      ready: true,
      importedAssets: [{
        guid: "a".repeat(32),
        kind: "model",
        status: "failed",
        filename: "hero.glb",
      }],
    })).toContain("successfully analyzed");
  });

  it("creates patches through the operation joined to each menu descriptor", () => {
    const object = importedModelFixture();
    const animator = listSceneComponentAdditions(object, "inspector", true)
      .find((addition) => addition.id === "animator");
    const rigidbody = listSceneComponentAdditions(object, "hierarchy", true)
      .find((addition) => addition.id === "rigidbody");
    const displacer = listSceneComponentAdditions(object, "inspector")
      .find((addition) => addition.id === "modifier:displacer");
    const characterController = listSceneComponentAdditions(object, "inspector")
      .find((addition) => addition.id === "characterController");

    expect(animator?.label).toBe("Animator Controller");
    expect(animator).toMatchObject({
      category: "Animation",
      hierarchyIcon: "animatorController",
      componentIcon: "animatorController",
    });
    expect(animator?.createPatch(object)).toMatchObject({
      animator: {
        version: 1,
        enabled: true,
        updateMode: "normal",
        cullingMode: "basedOnRenderVisibility",
      },
    });
    expect(animator?.createPatch(object).animationPlayer).toBeUndefined();
    expect(rigidbody?.createPatch(object).rigidbody?.enabled).toBe(true);
    expect(displacer?.createPatch(object).modifiers?.[0].type).toBe("displacer");
    expect(characterController?.createPatch(object)).toMatchObject({
      characterController: { enabled: true },
      rigidbody: { bodyType: "kinematic" },
      colliders: [{ shape: "capsule", axis: "y" }],
    });
  });

  it("resolves section presence without component branching in the Inspector", () => {
    const object: SceneObject = {
      ...fixture(),
      wireframe: { enabled: true },
      animationPlayer: { enabled: true },
      removedComponents: ["meshRenderer"],
    };

    expect(inspectorSectionsForObject(object).map((section) => section.id)).toEqual([
      "transform",
      "meshRenderer",
      "physicsValidation",
      "components",
      "wireframe",
    ]);
  });

  it("keeps a previously authored unsupported Animator visible and diagnosable", () => {
    const object: SceneObject = {
      ...fixture(),
      animator: createDefaultAnimatorComponent(),
    };

    expect(inspectorSectionsForObject(object).map((section) => section.id)).toContain("components");
    expect(animatorComponentUnavailableReason(object)).toContain("imported FBX, GLB, or glTF");
    expect(object.animator).toEqual(createDefaultAnimatorComponent());
  });
});
