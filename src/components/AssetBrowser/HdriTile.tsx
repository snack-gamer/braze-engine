import type { LibraryAsset } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { useAssetPreview } from "../../assets/preview/useAssetPreview";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";

type HdriTileProps = {
  hdri: LibraryAsset;
  displayName: string;
  selected: boolean;
  focused: boolean;
  active: boolean;
  showPreview: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
};

export function HdriTile({
  hdri,
  displayName,
  selected,
  focused,
  active,
  showPreview,
  onClick,
  onDoubleClick,
}: HdriTileProps) {
  const preview = useAssetPreview(
    "hdri",
    hdri.url,
    showPreview,
    hdri.contentRevision ?? hdri.updatedAt,
  );

  return (
    <div
      className={`asset-tile hdri-tile ${selected ? "selected" : ""} ${focused ? "focused" : ""} ${
        active ? "assigned" : ""
      }`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-tgan-hdri",
          JSON.stringify({ url: hdri.url, name: hdri.name, filename: hdri.filename }),
        );
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`Double-click to apply as environment · drag onto viewport · right-click for actions · ${hdri.filename}`}
    >
      <span className="hdri-tile__swatch">
        {showPreview && preview ? (
          <img src={preview} alt="" className="asset-tile__preview" draggable={false} />
        ) : (
          <EditorIcon name={assetIconNames.hdri} size="preview" />
        )}
      </span>
      <span className="asset-tile__name">{displayName}</span>
      <span className="hdri-tile__meta">{formatBytes(hdri.sizeBytes)}</span>
    </div>
  );
}
