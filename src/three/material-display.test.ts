import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { SceneObject } from "../types";
import { applyMaterialsToBody } from "./material-display";
import { retainMaterialTexture } from "./texture-cache";

function cameraObject(): SceneObject {
  return {
    id: "camera",
    name: "Camera",
    primitive: "camera",
    color: "#ffffff",
    visible: true,
    locked: false,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

describe("material display lifetime", () => {
  it("restores editor chrome and releases every lease owned by its replaced material", () => {
    const body = new THREE.Group();
    const original = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const generated = new THREE.MeshPhysicalMaterial({ color: "#ff0000" });
    const release = vi.fn();
    retainMaterialTexture(generated, "preview", () => ({
      value: new THREE.Texture(),
      release,
    }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), generated);
    mesh.userData.originalMaterial = original;
    body.add(mesh);

    applyMaterialsToBody(body, cameraObject());

    expect(mesh.material).toBe(original);
    expect(release).toHaveBeenCalledOnce();
  });
});
