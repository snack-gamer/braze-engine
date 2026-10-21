import type { LibraryAsset } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { useAssetPreview } from "../../assets/preview/useAssetPreview";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { importedModelSubAssets } from "./model-subasset-catalog";

type ModelTileProps = {
  asset: LibraryAsset;
  displayName: string;
  selected: boolean;
  focused: boolean;
  showPreview: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
};

export function ModelTile({
  asset,
  displayName,
  selected,
  focused,
  showPreview,
  expanded,
  onToggleExpanded,
  onClick,
  onDoubleClick,
}: ModelTileProps) {
  const subAssetCount = importedModelSubAssets(asset).length;
  // Only kick off the (expensive) Three.js thumbnail render when the tile is
  // large enough to benefit from it. Below the threshold the parent passes
  // showPreview=false and we display the shared model glyph instead.
  const preview = useAssetPreview(
    "model",
    asset.url,
    showPreview,
    asset.contentRevision ?? asset.updatedAt,
  );

  return (
    <div
      className={`asset-tile model-tile ${selected ? "selected" : ""} ${focused ? "focused" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-tgan-asset",
          JSON.stringify({ kind: "model", url: asset.url, name: asset.name, filename: asset.filename, guid: asset.guid }),
        );
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`Double-click to add to scene · drag to viewport · right-click for actions · ${asset.filename}`}
    >
      {subAssetCount > 0 && (
        <button
          type="button"
          className="model-tile__disclosure"
          aria-label={`${expanded ? "Collapse" : "Expand"} imported contents of ${displayName}`}
          aria-expanded={expanded}
          title={`${expanded ? "Collapse" : "Expand"} ${subAssetCount} imported ${subAssetCount === 1 ? "object" : "objects"}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <EditorIcon name={expanded ? "disclosureOpen" : "disclosureClosed"} size="micro" />
        </button>
      )}
      <span className="model-tile__icon">
        {showPreview && preview ? (
          <img src={preview} alt="" className="asset-tile__preview" draggable={false} />
        ) : (
          <EditorIcon name={assetIconNames.model} size="preview" />
        )}
      </span>
      <span className="asset-tile__name">{displayName}</span>
      <span className="model-tile__meta">{formatBytes(asset.sizeBytes)}</span>
    </div>
  );
}
