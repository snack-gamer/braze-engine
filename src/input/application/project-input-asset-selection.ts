import type { LibraryAsset } from "../../lib/asset-api";

export function inputAssetUnavailableReason(asset: LibraryAsset): string | undefined {
  if (asset.kind !== "inputActionMap" || asset.importerId !== "braze.input-action-map") return "Wrong asset type";
  if (!asset.guid || !/^[a-f0-9]{32}$/i.test(asset.guid)) return "Invalid asset identity";
  if (asset.status !== "ready") return asset.status === "failed" ? "Input Action Map import failed"
    : asset.status === "missing" ? "Missing Input Action Map" : "Input Action Map is not ready";
  if (asset.diagnostics?.some((diagnostic) => diagnostic.severity === "error")) return "Input Action Map has errors";
  return undefined;
}

/** Resolve by GUID across all asset families, never guess through ambiguity. */
export function selectedProjectInputAsset(guid: string | undefined, assets: readonly LibraryAsset[]) {
  if (!guid) return { asset: undefined, problem: "" };
  const matching = assets.filter((asset) => asset.guid?.toLowerCase() === guid.toLowerCase());
  if (matching.length === 0) return { asset: undefined, problem: "Missing Input Action Map" };
  if (matching.length > 1) return { asset: undefined, problem: "Ambiguous Input Action Map GUID" };
  return { asset: matching[0], problem: inputAssetUnavailableReason(matching[0]) ?? "" };
}

export function selectableProjectInputAssets(assets: readonly LibraryAsset[]): readonly LibraryAsset[] {
  const counts = new Map<string, number>();
  for (const asset of assets) if (asset.guid) {
    const guid = asset.guid.toLowerCase();
    counts.set(guid, (counts.get(guid) ?? 0) + 1);
  }
  return assets.filter((asset) => !inputAssetUnavailableReason(asset) && counts.get(asset.guid!.toLowerCase()) === 1);
}
