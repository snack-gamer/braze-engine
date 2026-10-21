import type {
  AuthoredAvatarMask,
} from "../../character/domain/character-asset-library";
import { writeCharacterAssetDrag } from "../../character/components/character-asset-drag-data";
import { IconAssetTile } from "./IconAssetTile";

type CharacterAssetTileProps = Readonly<{
  asset: AuthoredAvatarMask;
  selected: boolean;
  focused: boolean;
  onClick: (event: React.MouseEvent) => void;
  onDoubleClick: () => void;
}>;

export function CharacterAssetTile({
  asset,
  selected,
  focused,
  onClick,
  onDoubleClick,
}: CharacterAssetTileProps) {
  return (
    <IconAssetTile
      className="character-asset-tile"
      icon="avatar"
      iconClassName="character-asset-tile__icon character-asset-tile__icon--mask"
      name={asset.name}
      meta="Avatar Mask"
      selected={selected}
      focused={focused}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copyMove";
        writeCharacterAssetDrag(event.dataTransfer, { kind: "avatarMask", id: asset.id });
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title="Double-click to edit Avatar Mask · drag to organize"
    />
  );
}
