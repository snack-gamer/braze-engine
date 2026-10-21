import { describe, expect, it } from "vitest";
import type { Material, SceneObject } from "../types";
import { materialSignature } from "./material-signature";

const material = {
  id: "brick",
  name: "Brick",
  color: "#aa4422",
  roughness: 0.8,
  metalness: 0,
  specularIntensity: 0.5,
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
  sheenRoughness: 0.5,
  sheenColor: "#ffffff",
  side: "double",
  wireframe: false,
} satisfies Material;

const object = {
  id: "shop",
  name: "Shop",
  primitive: "gltf",
  color: "#ffffff",
  visible: true,
  locked: false,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
} satisfies SceneObject;

describe("material signature", () => {
  it("changes for authored BRDF, texture, object display, and imported material edits", () => {
    const baseline = materialSignature(object, material);
    expect(materialSignature(object, { ...material, roughness: 0.2 })).not.toBe(baseline);
    expect(materialSignature(object, { ...material, normalTextureUrl: "/normal.png" })).not.toBe(baseline);
    expect(materialSignature({ ...object, wireframe: { enabled: true } }, material)).not.toBe(baseline);

    const importedObject = {
      ...object,
      importedMaterialBindings: [{ slotKey: "wall", materialId: material.id }],
    };
    expect(materialSignature(importedObject, null, [material])).not.toBe(
      materialSignature(importedObject, null, [{ ...material, emissiveIntensity: 2 }]),
    );
  });
});
