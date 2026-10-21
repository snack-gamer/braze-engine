import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Material, SceneObject } from "../types";
import { applyMaterialsToBody, materialSignature } from "./materials";

function importedObject(): SceneObject {
  return {
    id: "shop",
    name: "Shop",
    primitive: "gltf",
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

function authoredMaterial(patch: Partial<Material> = {}): Material {
  return {
    id: "material-city-brick",
    name: "City Brick",
    color: "#cf704c",
    roughness: 0.72,
    metalness: 0.08,
    specularIntensity: 0.48,
    clearcoat: 0.1,
    clearcoatRoughness: 0.35,
    ior: 1.5,
    transmission: 0,
    emissive: "#201008",
    emissiveIntensity: 0.25,
    opacity: 1,
    normalScale: 1,
    bumpScale: 0.05,
    aoIntensity: 1,
    alphaCutoff: 0.05,
    envMapIntensity: 1,
    thickness: 0,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    side: "double",
    wireframe: false,
    ...patch,
  };
}

describe("imported runtime materials", () => {
  it("retains authored emissive color, intensity, and map", () => {
    const body = new THREE.Group();
    const emissiveMap = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({
      emissive: "#88ccff",
      emissiveIntensity: 3,
    });
    source.emissiveMap = emissiveMap;
    source.lightMap = new THREE.Texture();
    source.envMap = new THREE.Texture();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source);
    mesh.userData.originalMaterial = source;
    body.add(mesh);

    applyMaterialsToBody(body, importedObject());

    const prepared = mesh.material as THREE.MeshPhysicalMaterial;
    expect(prepared.emissive.getHexString()).toBe("88ccff");
    expect(prepared.emissiveIntensity).toBe(3);
    expect(prepared.emissiveMap).toBe(emissiveMap);
    expect(prepared.lightMap).toBeNull();
    expect(prepared.envMap).toBeNull();
  });

  it("detects and applies live shared-material color and scalar edits", () => {
    const object = { ...importedObject(), materialId: "material-city-brick" };
    const initial = authoredMaterial();
    const edited = authoredMaterial({
      color: "#368bc4",
      roughness: 0.22,
      metalness: 0.64,
      emissive: "#ff3300",
      emissiveIntensity: 2.5,
    });

    expect(materialSignature(object, initial)).not.toBe(
      materialSignature(object, edited),
    );

    const body = new THREE.Group();
    const source = new THREE.MeshStandardMaterial({ color: "#ffffff" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source);
    mesh.userData.originalMaterial = source;
    body.add(mesh);

    applyMaterialsToBody(body, object, edited, [edited]);

    const prepared = mesh.material as THREE.MeshPhysicalMaterial;
    expect(prepared.color.getHexString()).toBe("368bc4");
    expect(prepared.roughness).toBe(0.22);
    expect(prepared.metalness).toBe(0.64);
    expect(prepared.emissive.getHexString()).toBe("ff3300");
    expect(prepared.emissiveIntensity).toBe(2.5);
  });
});
