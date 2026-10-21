import type { LibraryAsset } from "../../lib/api";
import { formatBytes } from "../../lib/format";

type ImageTileProps = {
  asset: LibraryAsset;
  displayName: string;
  selected: boolean;
  focused: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
};

export function ImageTile({
  asset,
  displayName,
  selected,
  focused,
  onClick,
  onDoubleClick,
}: ImageTileProps) {
  return (
    <div
      className={`asset-tile image-tile ${selected ? "selected" : ""} ${focused ? "focused" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-tgan-asset",
          JSON.stringify({ kind: "image", url: asset.url, name: asset.name, filename: asset.filename, guid: asset.guid }),
        );
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`Double-click to add image card · drag to viewport · right-click for actions · ${asset.filename}`}
    >
      <span className="image-tile__thumb">
        <img src={asset.url} alt="" className="asset-tile__preview" draggable={false} />
      </span>
      <span className="asset-tile__name">{displayName}</span>
      <span className="image-tile__meta">{formatBytes(asset.sizeBytes)}</span>
    </div>
  );
}
