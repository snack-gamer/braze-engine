import type { SceneObject } from "../../scene/domain/scene-object";
import { isMeshRenderObject, restoreComponentPatch } from "../../lib/components";
import { captureMeshReference, type MeshAssetBinding, type MeshReference } from "../domain/mesh-reference";

export type MeshCatalogAsset = { guid?: string; kind?: string; status?: string; filename: string; url?: string;
  subAssets?: readonly { localId?: string; kind?: string; name?: string; sourceIndex?: unknown; nodePath?: unknown; skinned?: unknown; [key: string]: unknown }[] };

export function meshBindingForReference(reference: Extract<MeshReference, { kind: "asset" }>, assets: readonly MeshCatalogAsset[]) {
  const asset = assets.find((item) => item.guid?.toLowerCase() === reference.asset.guid.toLowerCase());
  const mesh = asset?.subAssets?.find((item) => item.localId === reference.asset.localId && item.kind === "mesh");
  if (!asset || asset.kind !== "model" || asset.status && asset.status !== "ready" || !mesh) throw new Error("Mesh asset is missing or unavailable. Choose an imported Mesh subasset.");
  if (mesh.skinned === true || asset.subAssets?.some((item) => item.kind === "skeleton" && Array.isArray(item.skins)
    && item.skins.some((skin: { bindings?: { meshLocalId?: string }[] }) => skin.bindings?.some((binding) => binding.meshLocalId === mesh.localId)))) {
    throw new Error("Skinned meshes require their imported model and Animator; choose a static mesh.");
  }
  const sourceIndex = typeof mesh.sourceIndex === "number" && Number.isInteger(mesh.sourceIndex) && mesh.sourceIndex >= 0 ? mesh.sourceIndex : null;
  const nodePath = typeof mesh.nodePath === "string" && mesh.nodePath ? mesh.nodePath : null;
  if (sourceIndex === null && nodePath === null) throw new Error("Mesh has no importer binding. Reimport the source model.");
  const extension = asset.filename.split(".").pop()?.toLowerCase();
  const primitive: SceneObject["primitive"] | null = extension === "glb" || extension === "gltf" ? "gltf" : extension === "fbx" ? "fbx" : extension === "usdz" ? "usdz" : extension === "usd" ? "usd" : null;
  if (!primitive) throw new Error("Unsupported mesh source format.");
  const binding: MeshAssetBinding = { localId: mesh.localId!, name: mesh.name || "Mesh", sourceIndex, nodePath };
  return { asset, binding, primitive };
}

export function meshAssignmentUnavailableReason(object: SceneObject): string | undefined {
  if (!isMeshRenderObject(object)) return "This object does not support Mesh Filter.";
  if (object.animator || object.botProfileId) return "Remove Animator before replacing its model geometry.";
  return undefined;
}

/** One edit for Inspector, scene/prefab tools and undo. Other components are untouched. */
export function assignMeshPatch(object: SceneObject, input: unknown, assets: readonly MeshCatalogAsset[] = []): Partial<SceneObject> {
  const reason = meshAssignmentUnavailableReason(object);
  if (reason) throw new Error(reason);
  const mesh = captureMeshReference(input);
  const patch: Partial<SceneObject> = { ...restoreComponentPatch(object, "meshFilter"),
    meshFilter: { enabled: true, ...(mesh === null ? { empty: true } : {}) },
    assetName: undefined, assetRef: undefined, assetUrl: undefined, assetNote: undefined, assetMissing: undefined, assetMeshBinding: undefined };
  if (mesh === null) return { ...patch, primitive: "cube" };
  if (mesh.kind === "builtin") return { ...patch, primitive: mesh.primitive };
  const resolved = meshBindingForReference(mesh, assets);
  return { ...patch, primitive: resolved.primitive, assetRef: mesh.asset, assetName: resolved.asset.filename,
    assetUrl: resolved.asset.url ?? `/3d-models/${resolved.asset.filename.split("/").map(encodeURIComponent).join("/")}`, assetMeshBinding: resolved.binding };
}
