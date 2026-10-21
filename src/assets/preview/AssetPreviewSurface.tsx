import { useEffect, useState } from "react";
import type { LibraryAsset } from "../../lib/api";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { assetPreviewSourceUrl } from "./asset-preview-source";
import { InteractiveModelPreview } from "./InteractiveModelPreview";
import { useAssetPreviewState } from "./useAssetPreview";

export type InspectorAssetKind = "model" | "image" | "prefab" | "hdri";

type AssetPreviewSurfaceProps = {
  asset: LibraryAsset;
  kind: InspectorAssetKind;
};

function DirectImagePreview({ asset }: { asset: LibraryAsset }) {
  const src = assetPreviewSourceUrl({
    kind: "image",
    url: asset.url,
    revision: asset.contentRevision ?? asset.updatedAt,
  });
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <EditorIcon name={assetIconNames.image} size="preview" />;
  return <img key={src} src={src} alt={`Preview of ${asset.name}`} onError={() => setFailed(true)} />;
}

function StaticAssetPreviewSurface({ asset, kind }: AssetPreviewSurfaceProps) {
  const generatedKind = kind === "hdri" ? kind : null;
  const preview = useAssetPreviewState(
    generatedKind ?? "model",
    asset.url,
    generatedKind !== null,
    asset.contentRevision ?? asset.updatedAt,
    "inspector",
  );
  const hasGeneratedPreview = generatedKind !== null && preview.status === "ready" && preview.url;

  return (
    <div
      className={`asset-inspector__preview asset-inspector__preview--${preview.status}`}
      role="img"
      aria-label={`Preview of ${asset.name}`}
    >
      {kind === "image" ? (
        <DirectImagePreview asset={asset} />
      ) : hasGeneratedPreview ? (
        <img src={preview.url} alt={`Preview of ${asset.name}`} />
      ) : (
        <span className="asset-inspector__preview-placeholder" aria-hidden="true">
          <EditorIcon name={assetIconNames[kind]} size="preview" />
          {generatedKind && preview.status === "loading" && <span>Preparing preview…</span>}
          {generatedKind && preview.status === "failed" && <span>Preview unavailable</span>}
        </span>
      )}
    </div>
  );
}

export function AssetPreviewSurface(props: AssetPreviewSurfaceProps) {
  if (props.kind === "model") return <InteractiveModelPreview asset={props.asset} />;
  return <StaticAssetPreviewSurface {...props} />;
}
