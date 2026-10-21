import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildCameraEditorBody } from "./camera-editor-body";
import { disposeObject } from "./dispose";

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

describe("camera editor body", () => {
  it("uses unlit, high-contrast editor materials and points the lens down local -Z", () => {
    const body = buildCameraEditorBody();
    const meshes = meshesOf(body);
    const lensGlass = body.getObjectByName("Camera Lens Glass") as THREE.Mesh;

    expect(body.userData.editorChrome).toBe(true);
    expect(meshes.map((mesh) => mesh.userData.cameraPart)).toEqual([
      "housing",
      "viewfinder",
      "lens-barrel",
      "lens-glass",
      "lens-ring",
    ]);
    expect(meshes.every((mesh) => mesh.material instanceof THREE.MeshBasicMaterial)).toBe(true);
    expect(meshes.every((mesh) => (mesh.material as THREE.Material).toneMapped === false)).toBe(true);
    expect(lensGlass.position.z).toBeLessThan(0);
  });

  it("keeps solid geometry selectable while presentation outlines ignore raycasts", () => {
    const body = buildCameraEditorBody();
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    );
    body.updateMatrixWorld(true);

    const hits = raycaster.intersectObject(body, true);
    expect(hits.some((hit) => (hit.object as THREE.Mesh).isMesh)).toBe(true);
    expect(hits.every((hit) => !(hit.object as THREE.LineSegments).isLineSegments)).toBe(true);
  });

  it("releases every owned geometry and material with the Scene node", () => {
    const body = buildCameraEditorBody();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    body.traverse((child) => {
      const renderable = child as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      const material = renderable.material;
      if (Array.isArray(material)) material.forEach((item) => materials.add(item));
      else if (material) materials.add(material);
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, "dispose"));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, "dispose"));

    disposeObject(body);

    geometryDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
