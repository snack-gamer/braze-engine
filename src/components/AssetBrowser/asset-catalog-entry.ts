import type { AssetKind } from "../../hooks/useAssetFolders";
import type { AssetCatalogEntry } from "./asset-catalog";
import type { Editing } from "./types";

export function assetCatalogRenameTarget(
  kind: "folder" | AssetKind,
  id: string,
): Exclude<Editing, null> {
  if (kind === "folder") return { kind: "rename-folder", path: id };
  if (kind === "material") return { kind: "rename-material", id };
  if (kind === "avatarMask") {
    return { kind: "rename-character-asset", assetKind: kind, id };
  }
  return { kind: `rename-${kind}`, filename: id } as Exclude<Editing, null>;
}

export function assetCatalogEntryIdentity(
  entry: Exclude<AssetCatalogEntry, { kind: "folder" }>,
): string {
  if (entry.kind === "scene") return entry.scene.id;
  if (entry.kind === "material") return entry.material.id;
  if (entry.kind === "avatarMask") return entry.asset.id;
  if (entry.kind === "modelSubAsset") return entry.subAsset.localId;
  return entry.asset.filename;
}
