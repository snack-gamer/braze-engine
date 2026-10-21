import { useMemo, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from "react";
import type { FolderPath } from "../../hooks/useAssetFolders";
import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { AssetFolderTreeRow } from "./AssetFolderTreeRow";
import {
  flattenVisibleFolderRows,
  type VisibleFolderRow,
} from "./folder-tree-model";
import type { AssetFilter } from "./types";
import { useVirtualFolderTree } from "./useVirtualFolderTree";

type AssetFolderSidebarProps = Readonly<{
  assetFilter: AssetFilter;
  path: FolderPath;
  folderDropHover: FolderPath | null;
  expandedFolders: ReadonlySet<FolderPath>;
  nonEmptyFolders: ReadonlySet<FolderPath>;
  folderChildren: ReadonlyMap<FolderPath, FolderPath[]>;
  basenameOf: (path: FolderPath) => string;
  onSelectFilter: (filter: AssetFilter) => void;
  onBrowseFolder: (path: FolderPath) => void;
  onToggleFolder: (path: FolderPath) => void;
  onFolderContext: (event: MouseEvent, path: FolderPath) => void;
  onRootContext: (event: MouseEvent) => void;
  onDropHover: (path: FolderPath | null) => void;
  onDropOnFolder: (event: DragEvent, path: FolderPath) => void;
}>;

export function AssetFolderSidebar(props: AssetFolderSidebarProps) {
  const rows = useMemo(
    () => flattenVisibleFolderRows(props.folderChildren, props.expandedFolders),
    [props.expandedFolders, props.folderChildren],
  );
  const rowByPath = useMemo(() => new Map(rows.map((row) => [row.path, row])), [rows]);
  const selectedPath = props.assetFilter === "all" ? props.path : null;
  const virtualTree = useVirtualFolderTree(rows, selectedPath);

  const renderRow = (row: VisibleFolderRow, virtualTop?: number) => (
    <AssetFolderTreeRow
      key={row.path || "root"}
      row={row}
      selected={selectedPath === row.path}
      dropHovered={props.folderDropHover === row.path}
      nonEmpty={props.nonEmptyFolders.has(row.path)}
      label={row.path ? props.basenameOf(row.path) : "Assets"}
      virtualTop={virtualTop}
      onBrowse={props.onBrowseFolder}
      onToggle={props.onToggleFolder}
      onContext={(event) => {
        if (row.path) props.onFolderContext(event, row.path);
        else props.onRootContext(event);
      }}
      onDropHover={props.onDropHover}
      onDrop={props.onDropOnFolder}
    />
  );
  const renderNestedRows = (parent: FolderPath): ReactNode => (
    (props.folderChildren.get(parent) ?? []).map((folderPath) => {
      const row = rowByPath.get(folderPath);
      if (!row) return null;
      return (
        <div key={folderPath} className="assets__tree-branch">
          {renderRow(row)}
          {row.expanded && row.childCount > 0 && renderNestedRows(folderPath)}
        </div>
      );
    })
  );
  const rootRow = rows[0];

  return (
    <aside
      ref={virtualTree.sidebarRef}
      className="assets__sidebar"
      aria-label="Project folders"
      onScroll={virtualTree.virtualized ? virtualTree.onScroll : undefined}
    >
      <div className="assets__sidebar-section">
        <div className="assets__sidebar-heading">
          <EditorIcon name="disclosureOpen" size="disclosure" />
          <EditorIcon name="favorite" size="row-action" />
          <span>Favorites</span>
        </div>
        {([
          ["scenes", "sceneDocument", "All Scenes"],
          ["materials", "material", "All Materials"],
          ["models", assetIconNames.model, "All Models"],
          ["prefabs", assetIconNames.prefab, "All Prefabs"],
          ["animation", "animationPlayer", "All Animation"],
          ["input", assetIconNames.inputActionMap, "All Input"],
        ] as const).map(([filter, icon, label]) => (
          <button
            key={filter}
            type="button"
            className={`assets__smart-row ${props.assetFilter === filter ? "selected" : ""}`}
            onClick={() => props.onSelectFilter(filter)}
          >
            <EditorIcon name={icon} size="tree" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div
        ref={virtualTree.treeRef}
        className={`assets__folder-tree ${virtualTree.virtualized ? "assets__folder-tree--virtualized" : ""}`}
        style={virtualTree.virtualized ? { height: virtualTree.totalHeight } as CSSProperties : undefined}
        role="tree"
        aria-label="Assets"
      >
        {virtualTree.virtualized
          ? virtualTree.renderedRows.map((row, offset) => renderRow(
              row,
              virtualTree.topForIndex(virtualTree.firstRenderedIndex + offset),
            ))
          : (
              <>
                {rootRow && renderRow(rootRow)}
                {rootRow?.expanded && renderNestedRows("")}
              </>
            )}
      </div>
    </aside>
  );
}
