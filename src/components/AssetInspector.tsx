import { lazy, Suspense } from "react";
import type { LibraryAsset } from "../lib/asset-api";
import type { FocusedLibraryAsset } from "./AssetBrowser/types";
import { RenderableAssetInspector, type RenderableAssetInspectorProps } from "./asset-inspector/RenderableAssetInspector";

const FontAssetInspector = lazy(() => import("../game-ui/components/FontAssetInspector"));
const InputActionMapInspector = lazy(() => import("../input/components/InputActionMapInspector"));
type AssetInspectorProps = Omit<RenderableAssetInspectorProps, "focused" | "onReveal" | "onRefresh" | "onDelete"> & {
  focused: FocusedLibraryAsset;
  projectAssets?: readonly LibraryAsset[];
  onReveal: (asset: LibraryAsset, kind: NonNullable<FocusedLibraryAsset>["kind"]) => void;
  onRefresh: (kind: NonNullable<FocusedLibraryAsset>["kind"]) => void;
  onDelete: (asset: LibraryAsset, kind: NonNullable<FocusedLibraryAsset>["kind"]) => void;
};

/** Dispatches feature-owned inspectors without eagerly loading their editors. */
export function AssetInspector({ focused, projectAssets = [], ...props }: AssetInspectorProps) {
  if (!focused) return null;
  if (focused.kind === "font") return <Suspense fallback={<p>Loading font…</p>}><FontAssetInspector usageCount={props.usageCount} asset={focused.asset} onReveal={() => props.onReveal(focused.asset, "font")} onDelete={() => props.onDelete(focused.asset, "font")} /></Suspense>;
  if (focused.kind === "inputActionMap") return <Suspense fallback={<p role="status">Loading Input Action Map…</p>}>
    <InputActionMapInspector key={focused.asset.guid ?? focused.asset.filename} asset={focused.asset} assets={projectAssets}
      onSaved={() => props.onRefresh("inputActionMap")} onReveal={() => props.onReveal(focused.asset, "inputActionMap")}
      onDelete={() => props.onDelete(focused.asset, "inputActionMap")} />
  </Suspense>;
  if (focused.kind === "model" || focused.kind === "image" || focused.kind === "prefab" || focused.kind === "hdri") {
    return <RenderableAssetInspector {...props} focused={focused as RenderableAssetInspectorProps["focused"]} />;
  }
  return <p role="alert">No Inspector is available for this asset type.</p>;
}
