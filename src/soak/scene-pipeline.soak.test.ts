import { describe, expect, it } from "vitest";
import type { Material } from "../materials/domain/material";
import type { SceneObject } from "../scene/domain/scene-object";
import { decodeSceneJson } from "../scene/serialization/scene-codec";
import { createSceneDocumentPatch } from "../scene/serialization/scene-delta";
import {
  SCENE_DOCUMENT_VERSION,
  type SceneDocumentV1,
} from "../scene/serialization/scene-document";
import { serializeSceneObject } from "../scene/serialization/scene-object-encoder";
import { createSceneReconciliationPlan } from "../three/reconciliation/scene-reconciliation-plan";

function sceneObject(index: number, materialId: string): SceneObject {
  return {
    id: `object-${index}`,
    name: `Object ${index}`,
    primitive: "cube",
    visible: true,
    locked: false,
    solo: false,
    color: `#${(index % 0xffffff).toString(16).padStart(6, "0")}`,
    position: [index % 100, Math.floor(index / 100), index % 7],
    rotation: [0, index % 360, 0],
    scale: [1, 1, 1],
    materialId,
  };
}

function material(index: number): Material {
  return {
    id: `material-${index}`,
    name: `Material ${index}`,
    color: "#ffffff",
    roughness: 0.5,
    metalness: 0,
    specularIntensity: 1,
    clearcoat: 0,
    clearcoatRoughness: 0,
    ior: 1.5,
    transmission: 0,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    normalScale: 1,
    bumpScale: 1,
    aoIntensity: 1,
    alphaCutoff: 0,
    envMapIntensity: 1,
    thickness: 0,
    sheen: 0,
    sheenRoughness: 0,
    sheenColor: "#ffffff",
    side: "front",
    wireframe: false,
  };
}

describe("large authored-scene pipeline soak", () => {
  it("round-trips 12,000 objects while deltas and reconciliation stay change-shaped", () => {
    const objectCount = 12_000;
    const materialCount = 24;
    const editedIndex = 8_765;
    const changedMaterialIndex = 7;
    const materials = Array.from({ length: materialCount }, (_, index) => material(index));
    const objects = Array.from({ length: objectCount }, (_, index) => (
      sceneObject(index, materials[index % materialCount].id)
    ));
    let serializationOperations = 0;
    const serializedObjects = objects.map((object) => {
      serializationOperations += 1;
      return serializeSceneObject(object);
    });
    const initialDocument: SceneDocumentV1 = {
      version: SCENE_DOCUMENT_VERSION,
      savedAt: "initial",
      objects: serializedObjects,
    };

    const decoded = decodeSceneJson(JSON.stringify(initialDocument));
    expect(serializationOperations).toBe(objectCount);
    expect(decoded.objects).toHaveLength(objectCount);
    expect(new Set(decoded.objects.map((object) => object.id)).size).toBe(objectCount);
    expect(decoded.objects[editedIndex]).toMatchObject({
      id: `object-${editedIndex}`,
      materialId: materials[editedIndex % materialCount].id,
      position: objects[editedIndex].position,
    });

    const initialPlan = createSceneReconciliationPlan(null, {
      objects,
      materials,
      hiddenGeneratorSourceIds: new Set(),
    });
    expect(initialPlan.syncObjectIds.size).toBe(objectCount);

    const unchangedPlan = createSceneReconciliationPlan(initialPlan.next, {
      objects: [...objects],
      materials: [...materials],
      hiddenGeneratorSourceIds: new Set(),
    });
    expect(unchangedPlan.syncObjectIds.size).toBe(0);
    expect(createSceneDocumentPatch(initialDocument, initialDocument)).toBeNull();

    const editedObjects = [...objects];
    editedObjects[editedIndex] = {
      ...editedObjects[editedIndex],
      position: [99, 98, 97],
    };
    const editedSerializedObjects = [...serializedObjects];
    editedSerializedObjects[editedIndex] = serializeSceneObject(editedObjects[editedIndex]);
    const editedDocument: SceneDocumentV1 = {
      ...initialDocument,
      savedAt: "edited",
      objects: editedSerializedObjects,
    };
    const patch = createSceneDocumentPatch(initialDocument, editedDocument);
    expect(patch).toEqual({
      metadata: { savedAt: "edited" },
      upsertObjects: [editedSerializedObjects[editedIndex]],
    });

    const editedPlan = createSceneReconciliationPlan(unchangedPlan.next, {
      objects: editedObjects,
      materials,
      hiddenGeneratorSourceIds: new Set(),
    });
    expect([...editedPlan.changedObjectIds]).toEqual([`object-${editedIndex}`]);
    expect([...editedPlan.syncObjectIds]).toEqual([`object-${editedIndex}`]);

    const changedMaterials = [...materials];
    changedMaterials[changedMaterialIndex] = {
      ...changedMaterials[changedMaterialIndex],
      roughness: 0.25,
    };
    const materialPlan = createSceneReconciliationPlan(editedPlan.next, {
      objects: editedObjects,
      materials: changedMaterials,
      hiddenGeneratorSourceIds: new Set(),
    });
    const expectedDependents = Math.floor(
      (objectCount - 1 - changedMaterialIndex) / materialCount,
    ) + 1;
    expect(materialPlan.changedMaterialIds).toEqual(new Set([`material-${changedMaterialIndex}`]));
    expect(materialPlan.materialDependentObjectIds.size).toBe(expectedDependents);
    expect(materialPlan.syncObjectIds.size).toBe(expectedDependents);
  });
});
