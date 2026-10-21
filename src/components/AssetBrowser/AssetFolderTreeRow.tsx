import type { CSSProperties, DragEvent, MouseEvent } from "react";
import type { FolderPath } from "../../hooks/useAssetFolders";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { hasAssetDragPayload, hasExternalFiles } from "./drag";
import type { VisibleFolderRow } from "./folder-tree-model";

type AssetFolderTreeRowProps = Readonly<{
  row: VisibleFolderRow;
  selected: boolean;
  dropHovered: boolean;
  nonEmpty: boolean;
  label: string;
  virtualTop?: number;
  onBrowse: (path: FolderPath) => void;
  onToggle: (path: FolderPath) => void;
  onContext: (event: MouseEvent) => void;
  onDropHover: (path: FolderPath | null) => void;
  onDrop: (event: DragEvent, path: FolderPath) => void;
}>;

/** One accessible folder tree item with its complete pointer/drop semantics. */
export function AssetFolderTreeRow({
  row,
  selected,
  dropHovered,
  nonEmpty,
  label,
  virtualTop,
  onBrowse,
  onToggle,
  onContext,
  onDropHover,
  onDrop,
}: AssetFolderTreeRowProps) {
  const isRoot = row.path === "";
  const hasChildren = row.childCount > 0;
  const handleDragOver = (event: DragEvent) => {
    const files = hasExternalFiles(event.dataTransfer);
    if (!files && !hasAssetDragPayload(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = files ? "copy" : "move";
    onDropHover(row.path);
  };
  const handleDragLeave = (event: DragEvent) => {
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) {
      if (dropHovered) onDropHover(null);
    }
  };
  const handleDrop = (event: DragEvent) => {
    event.stopPropagation();
    onDropHover(null);
    onDrop(event, row.path);
  };
  const style = {
    "--tree-depth": row.depth,
    ...(virtualTop === undefined
      ? {}
      : { position: "absolute", left: 0, top: 0, width: "100%", transform: `translateY(${virtualTop}px)` }),
  } as CSSProperties;

  return (
    <div
      className={`assets__tree-row ${isRoot ? "assets__tree-row--root" : ""} ${selected ? "selected" : ""} ${dropHovered ? "drop-target" : ""}`}
      style={style}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={isRoot || hasChildren ? row.expanded : undefined}
      aria-level={row.depth + 1}
      aria-posinset={row.siblingIndex + 1}
      aria-setsize={row.siblingCount}
      onContextMenu={onContext}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isRoot || hasChildren ? (
        <button
          type="button"
          className="assets__tree-disclosure"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(row.path);
          }}
          aria-label={`${row.expanded ? "Collapse" : "Expand"} ${label}`}
        >
          <EditorIcon name={row.expanded ? "disclosureOpen" : "disclosureClosed"} size="disclosure" />
        </button>
      ) : (
        <span className="assets__tree-disclosure" aria-hidden />
      )}
      <button
        type="button"
        className="assets__tree-label"
        onClick={() => onBrowse(row.path)}
        title={isRoot ? undefined : row.path}
      >
        <EditorIcon
          name={isRoot || row.expanded ? assetIconNames.openFolder : assetIconNames.folder}
          size="tree"
          filled={nonEmpty}
        />
        <span>{label}</span>
      </button>
    </div>
  );
}
