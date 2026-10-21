import type { LibraryAsset } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { assetIconNames } from "../../ui/icons";
import { IconAssetTile } from "./IconAssetTile";

type PrefabTileProps = {
  asset: LibraryAsset;
  displayName: string;
  selected: boolean;
  focused: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
};

export function PrefabTile({
  asset,
  displayName,
  selected,
  focused,
  onClick,
  onDoubleClick,
}: PrefabTileProps) {
  return (
    <IconAssetTile
      className="prefab-tile"
      icon={assetIconNames.prefab}
      iconClassName="prefab-tile__icon"
      name={displayName}
      meta={formatBytes(asset.sizeBytes)}
      selected={selected}
      focused={focused}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-tgan-asset",
          JSON.stringify({ kind: "prefab", url: asset.url, name: asset.name, filename: asset.filename, guid: asset.guid }),
        );
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={`Double-click to instantiate prefab · drag to viewport or hierarchy · right-click for actions · ${asset.filename}`}
    />
  );
}
