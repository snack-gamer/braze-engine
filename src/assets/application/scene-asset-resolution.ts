import type { LibraryAsset } from "../../lib/api";
import { versionedModelAssetUrl } from "../../lib/model-import-settings";
import type { SceneObject } from "../../types";

const MODEL_ASSET_RE = /\.(fbx|usdz|usd|glb|gltf)$/i;

export type SceneAssetInput = {
  url: string;
  name: string;
  filename: string;
  guid?: string;
};

export type ResolvedSceneAssetInput = SceneAssetInput & Partial<Pick<
  LibraryAsset,
  "importerId" | "kind" | "status" | "subAssets"
>>;

function baseAssetUrl(url: string): string {
  return url.split("#", 1)[0].split("?", 1)[0];
}

function hasImportVersion(url: string): boolean {
  const query = url.split("#", 1)[0].split("?", 2)[1];
  return query ? new URLSearchParams(query).has("importVersion") : false;
}

function isModelAsset(asset: Pick<LibraryAsset, "filename" | "kind">): boolean {
  return asset.kind === "model" || MODEL_ASSET_RE.test(asset.filename);
}

/** Resolves a durable library identity to the cache-safe URL used by runtime loading. */
export function runtimeUrlForLibraryAsset(
  asset: Pick<LibraryAsset, "contentRevision" | "filename" | "kind" | "url">,
  currentUrl?: string,
): string {
  if (!isModelAsset(asset)) return asset.url;
  if (typeof asset.contentRevision === "string" && asset.contentRevision) {
    return versionedModelAssetUrl(asset.url, asset.contentRevision);
  }
  if (
    currentUrl
    && baseAssetUrl(currentUrl) === baseAssetUrl(asset.url)
    && hasImportVersion(currentUrl)
  ) {
    return currentUrl;
  }
  return asset.url;
}

export function resolveAssetForSceneInsertion(
  input: SceneAssetInput,
  libraryAssets: readonly LibraryAsset[],
): ResolvedSceneAssetInput {
  const indexed = (input.guid
    ? libraryAssets.find((asset) => asset.guid === input.guid)
    : undefined)
    ?? libraryAssets.find((asset) => asset.filename === input.filename);
  if (!indexed) return input;
  return {
    url: runtimeUrlForLibraryAsset(indexed, input.url),
    name: indexed.name,
    filename: indexed.filename,
    guid: indexed.guid ?? input.guid,
    ...(indexed.kind ? { kind: indexed.kind } : {}),
    ...(indexed.importerId ? { importerId: indexed.importerId } : {}),
    ...(indexed.status ? { status: indexed.status } : {}),
    ...(indexed.subAssets ? { subAssets: indexed.subAssets } : {}),
  };
}

/** Reconciles authored AssetRefs without discarding their effective import revision. */
export function reconcileSceneAssetReferences(
  items: SceneObject[],
  libraryAssets: readonly LibraryAsset[],
): SceneObject[] {
  const byGuid = new Map(libraryAssets
    .filter((asset): asset is LibraryAsset & { guid: string } => Boolean(asset.guid))
    .map((asset) => [asset.guid, asset]));
  let changed = false;
  const next = items.map((object) => {
    if (!object.assetRef) return object;
    const asset = byGuid.get(object.assetRef.guid);
    if (!asset) {
      if (object.assetMissing && !object.assetUrl) return object;
      changed = true;
      return { ...object, assetUrl: undefined, assetMissing: true };
    }
    const assetUrl = runtimeUrlForLibraryAsset(asset, object.assetUrl);
    if (object.assetUrl === assetUrl && object.assetName === asset.name && !object.assetMissing) return object;
    changed = true;
    return { ...object, assetName: asset.name, assetUrl, assetMissing: false };
  });
  return changed ? next : items;
}
