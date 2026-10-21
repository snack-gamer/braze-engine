import type { Material } from "../../materials/domain/material";

export type UrlAssetPreviewKind = "model" | "hdri";
export type GeneratedAssetPreviewKind = UrlAssetPreviewKind | "material";

export type AssetPreviewSourceKind = UrlAssetPreviewKind | "image";
export type AssetPreviewSize = "thumbnail" | "inspector";

type BaseAssetPreviewDescriptor = {
  url: string;
  revision?: string | null;
  size?: AssetPreviewSize;
};

export type AssetPreviewDescriptor =
  | (BaseAssetPreviewDescriptor & { kind: UrlAssetPreviewKind })
  | (BaseAssetPreviewDescriptor & { kind: "material"; material: Material });

export function assetPreviewKey(descriptor: AssetPreviewDescriptor): string {
  return `${descriptor.kind}\u0000${descriptor.url}\u0000${descriptor.revision ?? ""}\u0000${descriptor.size ?? "thumbnail"}`;
}

export function modelPreviewPrimitive(url: string): "fbx" | "usdz" | "gltf" {
  const lower = url.split(/[?#]/, 1)[0].toLowerCase();
  if (lower.endsWith(".fbx")) return "fbx";
  if (lower.endsWith(".usdz") || lower.endsWith(".usd")) return "usdz";
  return "gltf";
}

export function refreshedAssetPreviewRevision(
  assetRevision: string | null | undefined,
  refreshRevision: string | null | undefined,
  refreshSequence: number,
): string | null {
  const base = assetRevision?.trim() ?? "";
  const refresh = refreshRevision?.trim() ?? "";
  if (!Number.isFinite(refreshSequence) || refreshSequence <= 0) return base || refresh || null;
  return `${base}|${refresh}|refresh-${Math.floor(refreshSequence)}`;
}

/**
 * Produces a cache-busted source URL without changing the asset's canonical URL.
 * Model import settings use the same revision so an Apply & Reimport cannot
 * receive an older settings-cache entry while its new thumbnail is rendering.
 */
export function assetPreviewSourceUrl(
  descriptor: Omit<AssetPreviewDescriptor, "kind"> & { kind: AssetPreviewSourceKind },
): string {
  const revision = descriptor.revision?.trim();
  if (!revision || /^(?:blob|data):/i.test(descriptor.url)) return descriptor.url;

  const hashIndex = descriptor.url.indexOf("#");
  const hash = hashIndex >= 0 ? descriptor.url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? descriptor.url.slice(0, hashIndex) : descriptor.url;
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set("previewRevision", revision);
  if (descriptor.kind === "model") params.set("importVersion", revision);
  return `${path}?${params.toString()}${hash}`;
}
