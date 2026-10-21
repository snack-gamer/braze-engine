import { useEffect } from "react";
import type { FocusedLibraryAsset } from "../../components/AssetBrowser/AssetBrowser";
import type { LibraryAsset } from "../../lib/api";

export function reconcileFocusedLibraryAsset(
  focused: FocusedLibraryAsset,
  assets: readonly LibraryAsset[],
): FocusedLibraryAsset {
  if (!focused || focused.kind === "hdri") return focused;
  const match = assets.find((asset) => (
    focused.asset.guid && asset.guid
      ? focused.asset.guid === asset.guid
      : focused.asset.filename === asset.filename
  ));
  if (!match) return null;
  if (match === focused.asset) return focused;
  return { ...focused, kind: match.kind ?? focused.kind, asset: match };
}

/** Keeps Inspector focus attached to GUID identity across refresh, rename, and deletion. */
export function useAssetFocusReconciliation({
  assets,
  focused,
  ready,
  setFocused,
}: Readonly<{
  assets: readonly LibraryAsset[];
  focused: FocusedLibraryAsset;
  ready: boolean;
  setFocused: (focused: FocusedLibraryAsset) => void;
}>) {
  useEffect(() => {
    if (!ready || !focused) return;
    const next = reconcileFocusedLibraryAsset(focused, assets);
    if (next !== focused) setFocused(next);
  }, [assets, focused, ready, setFocused]);
}
