import { useState } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { hasAssetDragPayload, hasExternalFiles } from "./drag";

type FolderTileProps = {
  name: string;
  path: string;
  selected: boolean;
  focused: boolean;
  /** True when the folder contains at least one subfolder or asset — flips
   *  the icon to a filled glyph so users can spot empty folders at a glance. */
  hasContent?: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onOpen: () => void;
  // Raw drop event; parent decides how to interpret the payload (single item
  // vs. selection). Only called when the dataTransfer carries asset types.
  onAssetDrop: (event: React.DragEvent) => void;
};

export function FolderTile({
  name,
  path,
  selected,
  focused,
  hasContent = false,
  onSelect,
  onOpen,
  onAssetDrop,
}: FolderTileProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`asset-tile folder-tile ${selected ? "selected" : ""} ${focused ? "focused" : ""} ${
        hovered ? "drop-target" : ""
      }`}
      data-folder-path={path}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onDragOver={(event) => {
        const files = hasExternalFiles(event.dataTransfer);
        if (!files && !hasAssetDragPayload(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = files ? "copy" : "move";
        if (!hovered) setHovered(true);
      }}
      onDragLeave={() => setHovered(false)}
      onDrop={(event) => {
        setHovered(false);
        if (!hasExternalFiles(event.dataTransfer) && !hasAssetDragPayload(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        onAssetDrop(event);
      }}
      title={`Double-click to open "${name}" · right-click for actions`}
    >
      <span className="folder-tile__icon">
        <EditorIcon
          name={hovered ? assetIconNames.openFolder : assetIconNames.folder}
          size="preview"
          filled={!hovered && hasContent}
        />
      </span>
      <span className="asset-tile__name">{name}</span>
    </div>
  );
}
