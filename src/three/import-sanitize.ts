import * as THREE from "three";
import { disposeObject } from "./dispose";

type ImportSanitizerReport = {
  removedLights: string[];
  removedCameras: string[];
  removedAudio: string[];
  removedHelpers: string[];
  strippedSceneState: boolean;
  strippedObjectUserData: number;
  strippedMaterialUserData: number;
  strippedMaterialHooks: number;
  strippedSceneLighting: number;
};

type ImportSanitizerOptions = {
  importCameras?: boolean;
  importLights?: boolean;
};

type FlaggedObject = THREE.Object3D & {
  isLight?: boolean;
  isCamera?: boolean;
  isAudio?: boolean;
  isAudioListener?: boolean;
  isHelper?: boolean;
};

type RenderMaterial = THREE.Material & {
  lightMap?: THREE.Texture | null;
  lightMapIntensity?: number;
  envMap?: THREE.Texture | null;
};

const reportEmpty = (): ImportSanitizerReport => ({
  removedLights: [],
  removedCameras: [],
  removedAudio: [],
  removedHelpers: [],
  strippedSceneState: false,
  strippedObjectUserData: 0,
  strippedMaterialUserData: 0,
  strippedMaterialHooks: 0,
  strippedSceneLighting: 0,
});

function label(object: THREE.Object3D): string {
  return object.name || object.type || object.uuid;
}

function materialList(material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function isLight(object: THREE.Object3D): boolean {
  return (object as FlaggedObject).isLight === true;
}

function isCamera(object: THREE.Object3D): boolean {
  return (object as FlaggedObject).isCamera === true;
}

function isAudio(object: THREE.Object3D): boolean {
  const item = object as FlaggedObject;
  return item.isAudio === true || item.isAudioListener === true || object.type === "Audio" || object.type === "AudioListener";
}

function isHelper(object: THREE.Object3D): boolean {
  return (object as FlaggedObject).isHelper === true || object.type.endsWith("Helper");
}

function stripSceneState(root: THREE.Object3D, report: ImportSanitizerReport): void {
  const scene = root as THREE.Scene;
  if (!scene.isScene) return;
  if (scene.background || scene.environment || scene.fog || scene.overrideMaterial) {
    scene.background = null;
    scene.environment = null;
    scene.fog = null;
    scene.overrideMaterial = null;
    report.strippedSceneState = true;
  }
}

function stripMaterialAuthority(material: THREE.Material, report: ImportSanitizerReport): void {
  const renderMaterial = material as RenderMaterial;
  let strippedSceneLighting = false;
  // Emissive color, intensity, and maps are authored surface properties (for
  // example illuminated signs) and must survive import. Scene-owned lighting
  // inputs remain unauthorized: Braze supplies its own environment and baked
  // lighting rather than inheriting those from a model container.
  if (renderMaterial.lightMap) {
    renderMaterial.lightMap = null;
    renderMaterial.lightMapIntensity = 0;
    strippedSceneLighting = true;
  }
  if (renderMaterial.envMap) {
    renderMaterial.envMap = null;
    strippedSceneLighting = true;
  }
  if (strippedSceneLighting) {
    material.needsUpdate = true;
    report.strippedSceneLighting++;
  }

  if (Object.keys(material.userData).length > 0) {
    material.userData = {};
    report.strippedMaterialUserData++;
  }
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
    material.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
    material.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
    material.needsUpdate = true;
    report.strippedMaterialHooks++;
  }
}

function removeUnauthorizedObjects(
  root: THREE.Object3D,
  report: ImportSanitizerReport,
  options: ImportSanitizerOptions,
): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child === root) return;
    if (isLight(child) && !options.importLights) {
      report.removedLights.push(label(child));
      toRemove.push(child);
    } else if (isCamera(child) && !options.importCameras) {
      report.removedCameras.push(label(child));
      toRemove.push(child);
    } else if (isAudio(child)) {
      report.removedAudio.push(label(child));
      toRemove.push(child);
    } else if (isHelper(child)) {
      report.removedHelpers.push(label(child));
      toRemove.push(child);
    }
  });
  for (const object of toRemove) {
    object.parent?.remove(object);
    disposeObject(object);
  }
}

export function sanitizeImportedAsset(
  root: THREE.Object3D,
  options: ImportSanitizerOptions = {},
): ImportSanitizerReport {
  const report = reportEmpty();
  stripSceneState(root, report);
  removeUnauthorizedObjects(root, report, options);
  root.traverse((child) => {
    if (Object.keys(child.userData).length > 0) {
      child.userData = {};
      report.strippedObjectUserData++;
    }
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialList(mesh.material)) stripMaterialAuthority(material, report);
  });
  return report;
}

export function importSanitizerChanged(report: ImportSanitizerReport): boolean {
  return (
    report.removedLights.length +
      report.removedCameras.length +
      report.removedAudio.length +
      report.removedHelpers.length +
      report.strippedObjectUserData +
      report.strippedMaterialUserData +
      report.strippedMaterialHooks +
      report.strippedSceneLighting >
      0 ||
    report.strippedSceneState
  );
}
