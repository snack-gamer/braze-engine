import { EditorIcon } from "../../ui/EditorIcon";
import { assetIconNames } from "../../ui/icons";
import { AssetCatalogItem } from "./AssetCatalogItem";
import { EditTile } from "./EditTile";
import { VirtualAssetViewport } from "./VirtualAssetViewport";
import type { AssetCatalogEntry } from "./asset-catalog";
import { ASSET_FILTERS, PREVIEW_THRESHOLD } from "./model";
import type { AssetFilter, Editing, ItemKey, ViewMode } from "./types";

type AssetBrowserCatalogViewProps = {
  catalog: readonly AssetCatalogEntry[];
  path: string;
  search: string;
  filter: AssetFilter;
  viewMode: ViewMode;
  tileSize: number;
  swatchSize: number;
  editing: Editing;
  selectedKeys: ReadonlySet<ItemKey>;
  focusKey: ItemKey | null;
  focusedMaterialId: string | null;
  expandedModelFilenames: ReadonlySet<string>;
  activeMaterialId?: string | null;
  activeHdriUrl?: string;
  activeObjectName?: string;
  favoriteKeys: ReadonlySet<ItemKey>;
  draggingKeys: ReadonlySet<ItemKey>;
  dropActive: boolean;
  folderHasContent: (path: string) => boolean;
  onCreateFolder: (name: string) => void;
  onSelect: (key: ItemKey, event: React.MouseEvent) => void;
  onToggleModelExpanded: (filename: string) => void;
  onOpen: (entry: AssetCatalogEntry) => void;
  onRename: (entry: AssetCatalogEntry, name: string) => void;
  onCancelEdit: () => void;
  onDropOnFolder: (event: React.DragEvent, path: string) => void;
  onItemContextMenu: (event: React.MouseEvent, entry: AssetCatalogEntry) => void;
  onItemDragStart: (event: React.DragEvent, entry: AssetCatalogEntry) => void;
  onItemDragEnd: () => void;
  onEmptyContextMenu: (event: React.MouseEvent) => void;
  onEmptyClick: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
};

export function AssetBrowserCatalogView(props: AssetBrowserCatalogViewProps) {
  const creatingFolder = !props.search.trim()
    && props.filter === "all"
    && props.editing?.kind === "create-folder"
    && props.editing.parent === props.path;
  const createFolderTile = creatingFolder ? (
    <EditTile
      className="folder-tile"
      icon={<span className="folder-tile__icon"><EditorIcon name={assetIconNames.folder} size="preview" /></span>}
      initial=""
      onCommit={props.onCreateFolder}
      onCancel={props.onCancelEdit}
    />
  ) : undefined;
  const emptyContent = props.catalog.length === 0 && !createFolderTile
    ? <p className="assets__empty">{emptyMessage(props.search, props.filter)}</p>
    : undefined;

  return (
    <VirtualAssetViewport
      items={props.catalog}
      viewMode={props.viewMode}
      tileSize={props.tileSize}
      swatchSize={props.swatchSize}
      selectedKeys={props.selectedKeys}
      focusedKey={props.focusKey}
      viewIdentity={`${props.path}\u0000${props.search}\u0000${props.filter}\u0000${props.viewMode}`}
      leadingItem={createFolderTile}
      emptyContent={emptyContent}
      dropActive={props.dropActive}
      renderItem={(entry) => (
        <AssetCatalogItem
          entry={entry}
          editing={props.editing}
          selectedKeys={props.selectedKeys}
          focusKey={props.focusKey}
          focusedMaterialId={props.focusedMaterialId}
          expandedModelFilenames={props.expandedModelFilenames}
          activeMaterialId={props.activeMaterialId}
          activeHdriUrl={props.activeHdriUrl}
          activeObjectName={props.activeObjectName}
          showPreviews={props.viewMode === "grid" && props.tileSize >= PREVIEW_THRESHOLD}
          showMaterialPreviews={props.viewMode === "grid"}
          folderHasContent={props.folderHasContent}
          onSelect={props.onSelect}
          onToggleModelExpanded={props.onToggleModelExpanded}
          onOpen={props.onOpen}
          onRename={props.onRename}
          onCancelEdit={props.onCancelEdit}
          onDropOnFolder={props.onDropOnFolder}
        />
      )}
      itemClassName={(entry, index, columns) => entry.kind === "folder" ? "" : [
        "asset-wrap",
        compoundEdges(props.catalog, entry, index, columns, createFolderTile ? 1 : 0),
        props.favoriteKeys.has(entry.key) ? "favorite" : "",
        props.draggingKeys.has(entry.key) ? "asset-wrap--dragging" : "",
      ].filter(Boolean).join(" ")}
      onItemContextMenu={props.onItemContextMenu}
      onItemDragStart={props.onItemDragStart}
      onItemDragEnd={props.onItemDragEnd}
      onEmptyContextMenu={props.onEmptyContextMenu}
      onEmptyClick={props.onEmptyClick}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    />
  );
}

function compoundEdges(
  catalog: readonly AssetCatalogEntry[],
  entry: AssetCatalogEntry,
  index: number,
  columns: number,
  leading: number,
): string {
  const next = catalog[index + 1];
  const filename = entry.kind === "modelSubAsset"
    ? entry.asset.filename
    : entry.kind === "model" && next?.kind === "modelSubAsset" ? entry.asset.filename : null;
  if (!filename) return "";
  const same = (offset: number) => {
    const candidate = catalog[index + offset];
    return (candidate?.kind === "model" || candidate?.kind === "modelSubAsset")
      && candidate.asset.filename === filename;
  };
  const column = (index + leading) % columns;
  const mask = Number(!same(-columns))
    + Number(!same(columns)) * 2
    + Number(column === 0 || !same(-1)) * 4
    + Number(column === columns - 1 || !same(1)) * 8;
  return `asset-wrap--compound-child ce${mask}`;
}

function emptyMessage(search: string, filter: AssetFilter): string {
  if (search.trim()) return `No assets match "${search}".`;
  if (filter === "favorites" || filter === "recent") return `No ${filter} assets yet.`;
  if (filter === "all") {
    return "Empty folder. Use + or right-click to create an asset or import files.";
  }
  return `No ${ASSET_FILTERS.find((entry) => entry.id === filter)?.label.toLowerCase()} in this folder.`;
}
