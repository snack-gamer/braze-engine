import * as THREE from "three";
import type {
  ImportedMaterialBinding,
  ModelSubAssetPreviewTarget,
} from "../../domain/model-subasset-preview-target";
import type {
  ModelPreviewAttachment,
  ModelPreviewExtension,
  ModelPreviewExtensionContext,
} from "../model-preview-extension";
import {
  importedMaterialSourceIndex,
  importedMeshSourceIndex,
  importedNodeSourcePath,
} from "../../../three/imported-subasset-bindings";
import { getImportedObjectPath } from "../../../three/imported-object-path";
import {
  isolatePreviewMeshes,
  overridePreviewObjectVisibility,
} from "./preview-object-visibility";

type MeshTarget = Extract<ModelSubAssetPreviewTarget, { kind: "mesh" }>;
type MaterialTarget = Extract<ModelSubAssetPreviewTarget, { kind: "material" }>;
type PreviewResource = ModelPreviewAttachment & Readonly<{ release: () => void }>;

function modelMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

function materialSet(material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function meshesForTarget(root: THREE.Object3D, target: MeshTarget): THREE.Mesh[] {
  const meshes = modelMeshes(root);
  if (target.nodePath) {
    const exact = meshes.filter((mesh) => selectionPath(root, mesh) === target.nodePath);
    if (exact.length > 0) return exact;
  }
  if (target.sourceIndex !== null) {
    const exact = meshes.filter((mesh) => importedMeshSourceIndex(mesh) === target.sourceIndex);
    if (exact.length > 0) return exact;
  }
  return [];
}

function materialAtBinding(
  root: THREE.Object3D,
  meshes: readonly THREE.Mesh[],
  binding: ImportedMaterialBinding,
): THREE.Material | null {
  const mesh = meshes.find((candidate) => selectionPath(root, candidate) === binding.nodePath);
  return mesh ? materialSet(mesh.material)[binding.slot] ?? null : null;
}

function selectionPath(root: THREE.Object3D, object: THREE.Object3D): string {
  return importedNodeSourcePath(object) ?? getImportedObjectPath(root, object);
}

function materialForTarget(root: THREE.Object3D, target: MaterialTarget): THREE.Material | null {
  const meshes = modelMeshes(root);
  for (const binding of target.bindings) {
    const material = materialAtBinding(root, meshes, binding);
    if (material) return material;
  }
  const materials = [...new Set(meshes.flatMap((mesh) => materialSet(mesh.material)))];
  if (target.sourceIndex !== null) {
    const exact = materials.find((material) => importedMaterialSourceIndex(material) === target.sourceIndex);
    if (exact) return exact;
  }
  return null;
}

function createPreviewController(
  kind: "Mesh" | "Material",
  attachResource: (context: ModelPreviewExtensionContext) => PreviewResource,
): ModelPreviewExtension {
  let release: (() => void) | null = null;
  let disposed = false;
  const detach = () => {
    release?.();
    release = null;
  };
  return {
    attach: (context) => {
      if (disposed) throw new Error(`${kind} preview controller is disposed`);
      detach();
      const resource = attachResource(context);
      release = resource.release;
      context.requestRender();
      return resource;
    },
    detach,
    dispose: () => {
      if (disposed) return;
      detach();
      disposed = true;
    },
  };
}

/** Isolates one importer-published mesh while retaining its hierarchy and skin bindings. */
export function createThreeMeshSubAssetPreviewController(target: MeshTarget): ModelPreviewExtension {
  return createPreviewController("Mesh", (context) => {
    const selected = meshesForTarget(context.root, target);
    if (selected.length === 0) throw new Error(`Imported mesh ${target.localId} is unavailable`);
    return {
      frameObjects: selected,
      release: isolatePreviewMeshes(context.root, selected),
    };
  });
}

/** Displays one exact imported material on a canonical lit sphere. */
export function createThreeMaterialSubAssetPreviewController(target: MaterialTarget): ModelPreviewExtension {
  return createPreviewController("Material", (context) => {
    const source = materialForTarget(context.root, target);
    if (!source) throw new Error(`Imported material ${target.localId} is unavailable`);
    const restoreVisibility = overridePreviewObjectVisibility(context.root, (object) => (
      (object as THREE.Mesh).isMesh ? false : undefined
    ));
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), source.clone());
    sphere.name = `${target.name} Material Preview`;
    sphere.rotation.y = Math.PI / 8;
    context.scene.add(sphere);
    return {
      frameObjects: [sphere],
      release: () => {
        restoreVisibility();
        sphere.removeFromParent();
        sphere.geometry.dispose();
        sphere.material.dispose();
      },
    };
  });
}
