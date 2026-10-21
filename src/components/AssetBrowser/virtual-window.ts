import type { ViewMode } from "./types";

export const ASSET_VIRTUALIZATION_THRESHOLD = 160;
const GRID_GAP = 4;
const GRID_PADDING = 6;
// Includes tile padding, borders, label gap, and the taller inline rename
// input so editing never overlaps the following virtual row.
const GRID_ITEM_CHROME_HEIGHT = 32;
const LIST_PADDING_TOP = 3;
const LIST_PADDING_BOTTOM = 8;
const LIST_ROW_HEIGHT = 22;
const OVERSCAN_ROWS = 2;

export type AssetVirtualWindowInput = {
  mode: ViewMode;
  itemCount: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollTop: number;
  tileSize: number;
  swatchSize: number;
};

export type AssetVirtualWindow = {
  columns: number;
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  positionFor: (index: number) => { x: number; y: number; width: number; height: number };
};

export function calculateAssetVirtualWindow(input: AssetVirtualWindowInput): AssetVirtualWindow {
  const count = Math.max(0, Math.floor(input.itemCount));
  if (input.mode === "list") return calculateListWindow(input, count);

  const itemHeight = input.swatchSize + GRID_ITEM_CHROME_HEIGHT;
  const rowStride = itemHeight + GRID_GAP;
  const availableWidth = Math.max(0, input.viewportWidth - GRID_PADDING * 2);
  const columns = Math.max(1, Math.floor((availableWidth + GRID_GAP) / (input.tileSize + GRID_GAP)));
  const rowCount = Math.ceil(count / columns);
  const firstRow = clamp(Math.floor((input.scrollTop - GRID_PADDING) / rowStride) - OVERSCAN_ROWS, 0, rowCount);
  const lastRow = clamp(
    Math.ceil((input.scrollTop + input.viewportHeight - GRID_PADDING) / rowStride) + OVERSCAN_ROWS,
    firstRow,
    rowCount,
  );
  return {
    columns,
    startIndex: Math.min(count, firstRow * columns),
    endIndex: Math.min(count, lastRow * columns),
    totalHeight: GRID_PADDING * 2 + Math.max(0, rowCount * rowStride - GRID_GAP),
    positionFor: (index) => ({
      x: GRID_PADDING + (index % columns) * (input.tileSize + GRID_GAP),
      y: GRID_PADDING + Math.floor(index / columns) * rowStride,
      width: input.tileSize,
      height: itemHeight,
    }),
  };
}

export function assetScrollOffsetForIndex(
  input: Pick<AssetVirtualWindowInput, "mode" | "viewportWidth" | "tileSize" | "swatchSize">,
  index: number,
): number {
  if (input.mode === "list") return LIST_PADDING_TOP + Math.max(0, index) * LIST_ROW_HEIGHT;
  const availableWidth = Math.max(0, input.viewportWidth - GRID_PADDING * 2);
  const columns = Math.max(1, Math.floor((availableWidth + GRID_GAP) / (input.tileSize + GRID_GAP)));
  return GRID_PADDING
    + Math.floor(Math.max(0, index) / columns) * (input.swatchSize + GRID_ITEM_CHROME_HEIGHT + GRID_GAP);
}

function calculateListWindow(input: AssetVirtualWindowInput, count: number): AssetVirtualWindow {
  const firstRow = clamp(Math.floor((input.scrollTop - LIST_PADDING_TOP) / LIST_ROW_HEIGHT) - OVERSCAN_ROWS, 0, count);
  const lastRow = clamp(
    Math.ceil((input.scrollTop + input.viewportHeight - LIST_PADDING_TOP) / LIST_ROW_HEIGHT) + OVERSCAN_ROWS,
    firstRow,
    count,
  );
  return {
    columns: 1,
    startIndex: firstRow,
    endIndex: lastRow,
    totalHeight: LIST_PADDING_TOP + count * LIST_ROW_HEIGHT + LIST_PADDING_BOTTOM,
    positionFor: (index) => ({ x: 0, y: LIST_PADDING_TOP + index * LIST_ROW_HEIGHT, width: input.viewportWidth, height: LIST_ROW_HEIGHT }),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
