import { useEffect, useState } from "react";
import type { LibraryAsset, ModelImportDocument } from "../../lib/api";
import { AssetPreviewSurface } from "../../assets/preview/AssetPreviewSurface";
import { decodeModelSubAssetPreviewTarget } from "../../assets/domain/model-subasset-preview-target";
import { refreshAssetPreview } from "../../assets/preview/useAssetPreview";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import {
  AssetAdvancedSection,
  AssetImportIssuesSection,
  AssetOverviewSection,
} from "./AssetMetadataSections";
import { ModelSubAssetInspector } from "./ModelSubAssetInspector";
import type { FocusedLibraryAsset } from "../AssetBrowser/AssetBrowser";
import { ModelImportSettingsPanel } from "../ModelImportSettingsPanel";
import { PanelHeader } from "../scene/PanelHeader";
import { AnimationClipPreview } from "../../character/components/AnimationClipPreview";
import { ModelImportAnimationPreview } from "../model-import/ModelImportAnimationPreview";
import type { ModelImportAnimationPreviewSelection } from "../model-import/ModelImportAnimationPreview";

export type RenderableAssetInspectorProps = {
  focused: Exclude<FocusedLibraryAsset, null> & { kind: "model" | "image" | "prefab" | "hdri" };
  modelAssets?: readonly LibraryAsset[];
  usageCount: number;
  onReveal: (asset: LibraryAsset, kind: "model" | "image" | "prefab" | "hdri") => void;
  onRefresh: (kind: "model" | "image" | "prefab" | "hdri") => void;
  onDelete: (asset: LibraryAsset, kind: "model" | "image" | "prefab" | "hdri") => void;
  onEditPrefab?: (asset: LibraryAsset) => void;
  onModelImportSaved?: (asset: LibraryAsset, doc: ModelImportDocument) => void;
};

export function RenderableAssetInspector({
  focused,
  modelAssets = [],
  usageCount,
  onReveal,
  onRefresh,
  onDelete,
  onEditPrefab,
  onModelImportSaved,
}: RenderableAssetInspectorProps) {
  const [animationPreview, setAnimationPreview] = useState<ModelImportAnimationPreviewSelection | null>();
  const focusIdentity = focused
    ? `${focused.asset.guid ?? focused.asset.filename}:${focused.localId ?? "main"}`
    : "";
  useEffect(() => setAnimationPreview(undefined), [focusIdentity]);
  if (!focused) return null;
  const subAsset = focused.localId
    ? focused.asset.subAssets?.find((item) => item.localId === focused.localId)
    : undefined;
  if (subAsset) {
    return (
      <ModelSubAssetInspector
        asset={focused.asset}
        subAsset={subAsset}
      />
    );
  }
  const { kind, asset } = focused;
  const icon = <EditorIcon name={assetIconNames[kind]} size="control" />;
  const importedClip = kind === "model"
    ? asset.subAssets?.find((candidate) => (
        candidate.kind === "clip"
        && (candidate.clipOrigin === "source" || candidate.clipOrigin === "segment")
        && candidate.importEnabled !== false
      ))
    : null;
  const importedClipTarget = importedClip ? decodeModelSubAssetPreviewTarget(importedClip) : null;
  const animatedPreview = kind === "model" && animationPreview
    ? <ModelImportAnimationPreview asset={asset} {...animationPreview} />
    : animationPreview === undefined
      && importedClipTarget?.kind === "clip"
      && importedClipTarget.runtimeClipIndex !== null
      ? <AnimationClipPreview asset={asset} target={importedClipTarget} />
      : null;

  return (
    <div className="rail-scroll">
      <PanelHeader
        title="Asset"
        icon={icon}
        actions={(
          <>
            {kind === "prefab" && onEditPrefab && (
              <button type="button" className="icon-button prefab-action" onClick={() => onEditPrefab(asset)} title="Edit prefab">
                <EditorIcon name="rename" size="control" />
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                if (kind === "model" || kind === "hdri") {
                  refreshAssetPreview(kind, asset.url, asset.contentRevision ?? asset.updatedAt);
                }
                onRefresh(kind);
              }}
              title="Refresh preview"
            >
              <EditorIcon name="refresh" size="control" />
            </button>
            <button type="button" className="icon-button" onClick={() => onReveal(asset, kind)} title="Reveal in Finder">
              <EditorIcon name="openExternal" size="control" />
            </button>
            <button type="button" className="icon-button danger" onClick={() => onDelete(asset, kind)} title="Delete asset">
              <EditorIcon name="delete" size="control" />
            </button>
          </>
        )}
      />
      <AssetOverviewSection
        asset={asset}
        kind={kind}
        usageCount={usageCount}
        preview={animatedPreview ? (
          <div className="asset-inspector__animated-preview">{animatedPreview}</div>
        ) : <AssetPreviewSurface asset={asset} kind={kind} />}
      />
      <AssetImportIssuesSection asset={asset} />
      {kind === "model" && (
        <ModelImportSettingsPanel
          asset={asset}
          modelAssets={modelAssets}
          onAnimationPreviewChange={setAnimationPreview}
          onSaved={(savedAsset, document) => {
            refreshAssetPreview("model", savedAsset.url, document.importVersion);
            onModelImportSaved?.(savedAsset, document);
          }}
        />
      )}
      <AssetAdvancedSection asset={asset} />
    </div>
  );
}
