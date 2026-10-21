import { describe, expect, it } from "vitest";
import type { Material, SceneObject } from "../../types";
import { createSceneReconciliationPlan } from "./scene-reconciliation-plan";

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    name: id,
    primitive: "cube",
    visible: true,
    locked: false,
    solo: false,
    color: "#ffffff",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

function material(id: string, patch: Partial<Material> = {}): Material {
  return {
    id,
    name: id,
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
    ...patch,
  };
}

const emptyIds = new Set<string>();

describe("scene reconciliation planning", () => {
  it("skips 20,000 structurally unchanged objects and targets one immutable edit", () => {
    const objects = Array.from({ length: 20_000 }, (_, index) => object(`object-${index}`));
    const initial = createSceneReconciliationPlan(null, { objects, materials: [], hiddenGeneratorSourceIds: emptyIds });
    expect(initial.syncObjectIds.size).toBe(20_000);

    const unchanged = createSceneReconciliationPlan(initial.next, {
      objects: [...objects],
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });
    expect(unchanged.syncObjectIds.size).toBe(0);

    const editedObjects = [...objects];
    editedObjects[12_345] = { ...editedObjects[12_345], name: "Changed" };
    const edited = createSceneReconciliationPlan(unchanged.next, {
      objects: editedObjects,
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });
    expect([...edited.changedObjectIds]).toEqual(["object-12345"]);
    expect([...edited.syncObjectIds]).toEqual(["object-12345"]);
    expect(edited.worldTransformRootIds.size).toBe(0);
  });

  it("targets transformed hierarchy roots without scheduling every descendant", () => {
    const parent = object("parent", { primitive: "transform" });
    const child = object("child", { parentId: "parent", primitive: "transform" });
    const camera = object("camera", {
      parentId: "child",
      primitive: "camera",
      camera: { fov: 52, near: 0.1, far: 200, target: [0, 0, -1] },
    });
    const initial = createSceneReconciliationPlan(null, {
      objects: [parent, child, camera],
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });
    const movedParent = { ...parent, position: [4, 0, 0] as SceneObject["position"] };
    const moved = createSceneReconciliationPlan(initial.next, {
      objects: [movedParent, child, camera],
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });

    expect([...moved.worldTransformRootIds]).toEqual(["parent"]);
    expect([...moved.presentationObjectIds]).toEqual(["parent"]);
  });

  it("targets only direct and imported-slot dependents of a changed material", () => {
    const firstMaterial = material("surface");
    const otherMaterial = material("other");
    const objects = [
      object("direct", { materialId: "surface" }),
      object("imported", { importedMaterialBindings: [{ slotKey: "body", materialId: "surface" }] }),
      object("unrelated", { materialId: "other" }),
      object("plain"),
    ];
    const initial = createSceneReconciliationPlan(null, {
      objects,
      materials: [firstMaterial, otherMaterial],
      hiddenGeneratorSourceIds: emptyIds,
    });
    const changed = createSceneReconciliationPlan(initial.next, {
      objects,
      materials: [{ ...firstMaterial, roughness: 0.2 }, otherMaterial],
      hiddenGeneratorSourceIds: emptyIds,
    });

    expect([...changed.changedMaterialIds]).toEqual(["surface"]);
    expect([...changed.materialDependentObjectIds].sort()).toEqual(["direct", "imported"]);
    expect([...changed.syncObjectIds].sort()).toEqual(["direct", "imported"]);
  });

  it("reparents an unchanged child when its previously missing parent appears or disappears", () => {
    const child = object("child", { parentId: "parent" });
    const initial = createSceneReconciliationPlan(null, {
      objects: [child],
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });
    const withParent = createSceneReconciliationPlan(initial.next, {
      objects: [object("parent"), child],
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });
    expect([...withParent.hierarchyDependentObjectIds]).toEqual(["child"]);
    expect([...withParent.worldTransformRootIds]).toEqual(["child"]);
    expect([...withParent.syncObjectIds].sort()).toEqual(["child", "parent"]);

    const withoutParent = createSceneReconciliationPlan(withParent.next, {
      objects: [child],
      materials: [],
      hiddenGeneratorSourceIds: emptyIds,
    });
    expect([...withoutParent.hierarchyDependentObjectIds]).toEqual(["child"]);
    expect([...withoutParent.worldTransformRootIds]).toEqual(["child"]);
    expect([...withoutParent.syncObjectIds]).toEqual(["child"]);
  });

  it("limits generator visibility work unless the global solo mode changes", () => {
    const objects = [object("a"), object("b"), object("c")];
    const initial = createSceneReconciliationPlan(null, { objects, materials: [], hiddenGeneratorSourceIds: emptyIds });
    const hidden = createSceneReconciliationPlan(initial.next, {
      objects,
      materials: [],
      hiddenGeneratorSourceIds: new Set(["b"]),
    });
    expect([...hidden.presentationObjectIds]).toEqual(["b"]);

    const soloObjects = [{ ...objects[0], solo: true }, objects[1], objects[2]];
    const solo = createSceneReconciliationPlan(hidden.next, {
      objects: soloObjects,
      materials: [],
      hiddenGeneratorSourceIds: new Set(["b"]),
    });
    expect([...solo.presentationObjectIds].sort()).toEqual(["a", "b", "c"]);
  });
});
