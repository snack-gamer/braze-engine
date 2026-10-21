import type { AssetSubAsset, LibraryAsset } from "../../lib/api";

const KEY_PREFIX = "modelSubAsset:";
const KEY_SEPARATOR = "\u0000";

export function importedModelSubAssets(asset: Pick<LibraryAsset, "subAssets">): AssetSubAsset[] {
  return (asset.subAssets ?? [])
    .filter((subAsset) => subAsset.localId !== "main" && Boolean(subAsset.localId.trim()));
}

export function modelSubAssetKey(filename: string, localId: string): string {
  return `${KEY_PREFIX}${filename}${KEY_SEPARATOR}${localId}`;
}

export function parseModelSubAssetKey(key: string): Readonly<{ filename: string; localId: string }> | null {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const value = key.slice(KEY_PREFIX.length);
  const separator = value.indexOf(KEY_SEPARATOR);
  if (separator <= 0 || separator === value.length - 1) return null;
  return { filename: value.slice(0, separator), localId: value.slice(separator + 1) };
}
