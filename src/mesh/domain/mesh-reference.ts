import type { AssetRef } from "../../assets/domain/asset-reference";
import type { SceneObject } from "../../scene/domain/scene-object";

export const BUILTIN_MESHES = ["cube", "sphere", "plane"] as const;
export type MeshReference = { kind: "builtin"; primitive: typeof BUILTIN_MESHES[number] }
  | { kind: "asset"; asset: AssetRef } | null;
/** Derived importer binding, rebuilt from the GUID/local ID catalog; never authored. */
export type MeshAssetBinding = { localId: string; name: string; sourceIndex: number | null; nodePath: string | null };

export function captureMeshReference(value: unknown): MeshReference {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Mesh must be a builtin, an imported Mesh AssetRef, or null.");
  const input = value as Record<string, unknown>;
  if (input.kind === "builtin" && Object.keys(input).every((key) => ["kind", "primitive"].includes(key))
    && BUILTIN_MESHES.includes(input.primitive as never)) return { kind: "builtin", primitive: input.primitive as typeof BUILTIN_MESHES[number] };
  if (input.kind === "asset" && Object.keys(input).every((key) => ["kind", "asset"].includes(key)) && input.asset && typeof input.asset === "object") {
    const asset = input.asset as Record<string, unknown>;
    if (Object.keys(asset).every((key) => ["guid", "localId"].includes(key)) && typeof asset.guid === "string" && /^[a-f0-9]{32}$/i.test(asset.guid)
      && typeof asset.localId === "string" && asset.localId.length > 0 && asset.localId.length <= 256) {
      return { kind: "asset", asset: { guid: asset.guid.toLowerCase(), localId: asset.localId } };
    }
  }
  throw new Error("Choose Cube, Sphere, Plane, or an imported Mesh AssetRef from assets.list.");
}

/** The existing source kind/AssetRef is the single stored geometry identity. */
export function meshReferenceForObject(object: SceneObject): MeshReference {
  if (object.meshFilter?.empty) return null;
  if (object.assetRef) return { kind: "asset", asset: object.assetRef };
  return BUILTIN_MESHES.includes(object.primitive as never)
    ? { kind: "builtin", primitive: object.primitive as typeof BUILTIN_MESHES[number] } : null;
}
