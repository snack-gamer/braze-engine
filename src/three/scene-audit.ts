import * as THREE from "three";
import type { SceneObject } from "../types";
import type { Runtime } from "./runtime";

type AuditFinding = {
  kind: "unexpected-light" | "unexpected-camera" | "unexpected-object-root" | "unlit-material" | "hidden-self-lighting";
  object: string;
  detail: string;
};

type FlaggedObject = THREE.Object3D & {
  isLight?: boolean;
  isCamera?: boolean;
};

type RenderMaterial = THREE.Material & {
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  envMap?: THREE.Texture | null;
};

let lastAuditKey = "";

function label(object: THREE.Object3D): string {
  const id = typeof object.userData.objectId === "string" ? ` [${object.userData.objectId}]` : "";
  return `${object.name || object.type || object.uuid}${id}`;
}

function materialList(material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function isDescendantOf(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (cursor === root) return true;
    cursor = cursor.parent;
  }
  return false;
}

function hasAncestorUserData(object: THREE.Object3D, key: string): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (cursor.userData[key]) return true;
    cursor = cursor.parent;
  }
  return false;
}

function isEditorOrWorldObject(object: THREE.Object3D, runtime: Runtime): boolean {
  return (
    object === runtime.objectRoot ||
    object === runtime.labelRoot ||
    object === runtime.cameraGizmoRoot ||
    object === runtime.grid.object ||
    object === runtime.transformControls.getHelper() ||
    object === runtime.worldLights.key ||
    object === runtime.worldLights.hemisphere ||
    object === runtime.worldLights.key.target ||
    hasAncestorUserData(object, "editorChrome") ||
    hasAncestorUserData(object, "modifierHandle") ||
    hasAncestorUserData(object, "renderPassHook") ||
    hasAncestorUserData(object, "shadowInfrastructure") ||
    hasAncestorUserData(object, "skyEnvironment")
  );
}

function objectForMesh(mesh: THREE.Mesh, objectsById: Map<string, SceneObject>): SceneObject | null {
  let cursor: THREE.Object3D | null = mesh;
  while (cursor) {
    const id = cursor.userData.objectId;
    if (typeof id === "string") return objectsById.get(id) ?? null;
    cursor = cursor.parent;
  }
  return null;
}

function isImportedModel(object: SceneObject | null): boolean {
  return object?.primitive === "fbx" || object?.primitive === "gltf" || object?.primitive === "usd" || object?.primitive === "usdz";
}

function hasExplicitSelfLighting(object: SceneObject | null): boolean {
  if (!object) return false;
  if (object.primitive === "water" || object.water) return true;
  // Emissive properties authored in FBX/glTF/USD materials are legitimate
  // surface data. Imported Light objects are still rejected by the importer;
  // this only prevents their material emission from being misdiagnosed as a
  // second scene-lighting authority.
  if (isImportedModel(object)) return true;
  return Boolean(object.materialId);
}

function materialHasSelfLighting(material: THREE.Material): string | null {
  const item = material as RenderMaterial;
  const parts: string[] = [];
  if (item.emissive && item.emissive.getHex() !== 0) parts.push(`emissive=#${item.emissive.getHexString()}`);
  if ((item.emissiveIntensity ?? 0) > 0) parts.push(`emissiveIntensity=${item.emissiveIntensity}`);
  if (item.emissiveMap) parts.push("emissiveMap");
  if (item.lightMap) parts.push("lightMap");
  if (item.envMap) parts.push("envMap");
  return parts.length > 0 ? parts.join(", ") : null;
}

function auditObjectPlacement(runtime: Runtime, findings: AuditFinding[]): void {
  for (const child of runtime.scene.children) {
    if (isDescendantOf(child, runtime.objectRoot) || isEditorOrWorldObject(child, runtime)) continue;
    findings.push({
      kind: "unexpected-object-root",
      object: label(child),
      detail: `Scene child outside objectRoot: ${child.type}`,
    });
  }
}

export function auditRuntimeScene(runtime: Runtime, objects: SceneObject[]): void {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const findings: AuditFinding[] = [];

  runtime.scene.traverse((object) => {
    const flagged = object as FlaggedObject;
    if (flagged.isLight && object !== runtime.worldLights.key && object !== runtime.worldLights.hemisphere) {
      const light = object as THREE.Light;
      findings.push({
        kind: "unexpected-light",
        object: label(object),
        detail: `${object.type} intensity=${light.intensity}`,
      });
    }
    if (flagged.isCamera && object !== runtime.camera) {
      findings.push({ kind: "unexpected-camera", object: label(object), detail: object.type });
    }

    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || isEditorOrWorldObject(mesh, runtime)) return;
    const sceneObject = objectForMesh(mesh, objectsById);
    for (const material of materialList(mesh.material)) {
      if (isImportedModel(sceneObject) && material instanceof THREE.MeshBasicMaterial) {
        findings.push({
          kind: "unlit-material",
          object: label(mesh),
          detail: `${sceneObject?.name ?? "unknown"} uses MeshBasicMaterial in beauty render`,
        });
      }
      const selfLighting = materialHasSelfLighting(material);
      if (selfLighting && !hasExplicitSelfLighting(sceneObject)) {
        findings.push({
          kind: "hidden-self-lighting",
          object: label(mesh),
          detail: selfLighting,
        });
      }
    }
  });

  auditObjectPlacement(runtime, findings);
  const key = JSON.stringify(findings);
  if (key === lastAuditKey) return;
  lastAuditKey = key;
  if (findings.length > 0) console.warn("Scene audit found unaccounted render authority", findings);
}
