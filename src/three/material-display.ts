import * as THREE from "three";
import type { Material, SceneObject } from "../types";
import { resolveMaterialSetForMesh } from "./material-resolution";
import type { MaterialSet } from "./material-surface";
import { applyDisplacerToMaterialSet } from "./modifiers/displacer-material";

function disposeMaterialSet(material: MaterialSet): void {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

function restoreEditorChromeMaterial(mesh: THREE.Mesh): void {
  const original = mesh.userData.originalMaterial as MaterialSet | undefined;
  if (!original) return;
  const previous = mesh.material;
  if (previous && previous !== original) disposeMaterialSet(previous);
  mesh.material = original;
}

function applyWireframe(material: THREE.Material): void {
  (material as THREE.Material & { wireframe?: boolean }).wireframe = true;
  material.needsUpdate = true;
}

function applyWireframeSet(material: MaterialSet): void {
  if (Array.isArray(material)) material.forEach(applyWireframe);
  else applyWireframe(material);
}

/** Replaces renderable body materials while retaining imported/editor originals. */
export function applyMaterialsToBody(
  body: THREE.Object3D,
  object: SceneObject,
  material: Material | null = null,
  materialLibrary: Material[] = [],
): void {
  const materialById = new Map(materialLibrary.map((item) => [item.id, item]));
  body.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (object.primitive === "camera" || object.primitive === "directionalLight") {
      restoreEditorChromeMaterial(mesh);
      return;
    }

    const previous = mesh.material;
    const original = mesh.userData.originalMaterial as MaterialSet | undefined;
    const slotKeys = mesh.userData.tganMaterialSlotKeys as string[] | undefined;
    const next = resolveMaterialSetForMesh(original, object, material, materialById, slotKeys);
    if (object.wireframe?.enabled) applyWireframeSet(next);
    applyDisplacerToMaterialSet(next, object);

    if (previous && previous !== original && previous !== next) disposeMaterialSet(previous);
    mesh.material = next;
  });
}
