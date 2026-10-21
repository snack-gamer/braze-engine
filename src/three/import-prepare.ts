import * as THREE from "three";
import type { ModelImportSettings } from "../lib/model-import-settings";
import { recalculateMeshNormals } from "./recalculate-normals";

const DEFAULT_ASSET_TARGET_SIZE = 1.7;
const AVATAR_BOT_TARGET_SIZE = 0.45;

export type ImportedAssetPreparationReport = Readonly<{
  preservedSkinnedHierarchy: boolean;
}>;

function sortChildrenByName(root: THREE.Object3D): void {
  root.traverse((child) => {
    child.children.sort((a, b) => (a.name || a.uuid).localeCompare(b.name || b.uuid));
  });
}

function flattenHierarchy(root: THREE.Object3D): void {
  root.updateWorldMatrix(true, true);
  const meshes: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child !== root && (child as THREE.Mesh).isMesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    mesh.applyMatrix4(mesh.matrixWorld);
    mesh.parent?.remove(mesh);
    root.add(mesh);
  }
}

function hasSkinnedContent(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) found = true;
  });
  return found;
}

function recalculateNormals(root: THREE.Object3D, settings: ModelImportSettings): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    recalculateMeshNormals(mesh, settings);
  });
}

export function prepareImportedAsset(
  loaded: THREE.Object3D,
  settings: ModelImportSettings,
  options: { botAsset: boolean; importedLibraryAsset: boolean },
): ImportedAssetPreparationReport {
  if (!settings.importVisibility) {
    loaded.traverse((child) => {
      child.visible = true;
    });
  }
  const preservedSkinnedHierarchy = !settings.preserveHierarchy && hasSkinnedContent(loaded);
  if (!settings.preserveHierarchy && !preservedSkinnedHierarchy) flattenHierarchy(loaded);
  if (settings.sortHierarchyByName) sortChildrenByName(loaded);
  if (settings.normals === "calculate") recalculateNormals(loaded, settings);

  const targetSize = options.botAsset ? AVATAR_BOT_TARGET_SIZE : DEFAULT_ASSET_TARGET_SIZE;
  const unitScale = settings.convertUnits && settings.sourceUnit === "centimeter" ? 0.01 : 1;
  const importScale = unitScale * settings.scaleFactor;
  const box = new THREE.Box3().setFromObject(loaded);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSide = Math.max(size.x, size.y, size.z, 0.001);
  const fit = settings.fitToEditorSize ? targetSize / Math.max(0.000001, maxSide * importScale) : 1;
  loaded.scale.multiplyScalar(fit * importScale);

  // Production assets carry an authored pivot that placement, prefab, and
  // collider data rely on. Auto-fit is the legacy/editor-preview path: only
  // that path is allowed to recenter or ground the imported graph. Unit and
  // explicit scale conversion still apply around the authored pivot.
  if (!settings.fitToEditorSize) return { preservedSkinnedHierarchy };

  const center = new THREE.Vector3();
  box.getCenter(center);
  loaded.position.x -= center.x * fit * importScale;
  loaded.position.z -= center.z * fit * importScale;
  if (options.botAsset || options.importedLibraryAsset) {
    loaded.position.y -= box.min.y * fit * importScale;
  } else {
    loaded.position.y -= center.y * fit * importScale;
  }
  return { preservedSkinnedHierarchy };
}
