import type { RefObject } from "react";
import { EditorIcon } from "../../ui/EditorIcon";
import { EditorRange } from "../../ui/controls";
import { ASSET_FILTERS, TILE_MAX, TILE_MIN, ZOOM_STEP } from "./model";
import type { AssetBrowserMenu, AssetFilter, ViewMode } from "./types";

type AssetBrowserHeaderProps = {
  destinationLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  assetFilter: AssetFilter;
  onAssetFilterChange: (filter: AssetFilter) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  tileSize: number;
  onTileSizeChange: (size: number) => void;
  hdriUploadRef: RefObject<HTMLInputElement | null>;
  modelUploadRef: RefObject<HTMLInputElement | null>;
  imageUploadRef: RefObject<HTMLInputElement | null>;
  onUploadHdri: (file: File) => void;
  onImportAssetFiles: (files: FileList | null) => void;
  onOpenMenu: (menu: AssetBrowserMenu) => void;
};

export function AssetBrowserHeader({
  destinationLabel,
  search,
  onSearchChange,
  assetFilter,
  onAssetFilterChange,
  viewMode,
  onViewModeChange,
  tileSize,
  onTileSizeChange,
  hdriUploadRef,
  modelUploadRef,
  imageUploadRef,
  onUploadHdri,
  onImportAssetFiles,
  onOpenMenu,
}: AssetBrowserHeaderProps) {
  return (
    <div className="assets__head">
      <div className="assets__dock-tab" role="heading" aria-level={2}>Project</div>
      <div className="assets__head-actions">
        <button
          type="button"
          className="ghost-button compact assets__create"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenMenu({ kind: "empty", x: rect.left, y: rect.bottom + 4 });
          }}
          title={`Create or import into ${destinationLabel}`}
          aria-label={`Create or import into ${destinationLabel}`}
        >
          <EditorIcon name="add" size="control" />
          <EditorIcon name="disclosureOpen" size="micro" />
        </button>
        <div className="assets__search">
          <EditorIcon name="search" size="row-action" />
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Search assets"
          />
        </div>
        <select
          className="editor-select assets__filter-select"
          value={assetFilter}
          onChange={(event) => onAssetFilterChange(event.target.value as AssetFilter)}
          aria-label="Asset type filter"
          title="Asset type filter"
        >
          {ASSET_FILTERS.map((filter) => (
            <option key={filter.id} value={filter.id}>{filter.label}</option>
          ))}
        </select>
        <div className="editor-segmented editor-segmented--icons assets__view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === "grid" ? "icon-button active" : "icon-button"}
            onClick={() => onViewModeChange("grid")}
            title="Icon view"
            aria-label="Icon view"
            aria-pressed={viewMode === "grid"}
          >
            <EditorIcon name="gridView" size="row-action" />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "icon-button active" : "icon-button"}
            onClick={() => onViewModeChange("list")}
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <EditorIcon name="listView" size="row-action" />
          </button>
        </div>
        <div className="editor-control-group assets__zoom" title="Tile size">
          <button
            type="button"
            className="icon-button compact"
            onClick={() => onTileSizeChange(Math.max(TILE_MIN, tileSize - ZOOM_STEP))}
            disabled={tileSize <= TILE_MIN}
            aria-label="Smaller tiles"
          >
            <EditorIcon name="zoomOut" size="row-action" />
          </button>
          <EditorRange
            min={TILE_MIN}
            max={TILE_MAX}
            step={4}
            value={tileSize}
            onChange={(event) => onTileSizeChange(Number(event.target.value))}
            aria-label="Tile size"
          />
          <button
            type="button"
            className="icon-button compact"
            onClick={() => onTileSizeChange(Math.min(TILE_MAX, tileSize + ZOOM_STEP))}
            disabled={tileSize >= TILE_MAX}
            aria-label="Larger tiles"
          >
            <EditorIcon name="zoomIn" size="row-action" />
          </button>
        </div>
        <input
          ref={hdriUploadRef}
          type="file"
          accept=".hdr,.exr,image/*"
          className="hidden-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadHdri(file);
            event.target.value = "";
          }}
        />
        <input
          ref={modelUploadRef}
          type="file"
          multiple
          accept=".fbx,.usdz,.usd,.glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.gif,.bmp,.ktx2,.woff2,.woff,.ttf,.otf"
          className="hidden-input"
          onChange={(event) => {
            onImportAssetFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={imageUploadRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.gif,.bmp"
          className="hidden-input"
          onChange={(event) => {
            onImportAssetFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
