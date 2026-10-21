import type { FolderPath } from "../../hooks/useAssetFolders";

export const FOLDER_TREE_VIRTUALIZATION_THRESHOLD = 200;
export const FOLDER_TREE_ROW_HEIGHT = 24;
const TREE_PADDING_TOP = 3;
const TREE_PADDING_BOTTOM = 8;
const OVERSCAN_ROWS = 4;

export type VisibleFolderRow = Readonly<{
  path: FolderPath;
  depth: number;
  childCount: number;
  expanded: boolean;
  siblingIndex: number;
  siblingCount: number;
}>;

export type FolderTreeWindow = Readonly<{
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  topForIndex: (index: number) => number;
}>;

/** Flattens only disclosed branches, guarding malformed folder cycles. */
export function flattenVisibleFolderRows(
  folderChildren: ReadonlyMap<FolderPath, FolderPath[]>,
  expandedFolders: ReadonlySet<FolderPath>,
): VisibleFolderRow[] {
  const rootChildren = folderChildren.get("") ?? [];
  const rows: VisibleFolderRow[] = [{
    path: "",
    depth: 0,
    childCount: rootChildren.length,
    expanded: expandedFolders.has(""),
    siblingIndex: 0,
    siblingCount: 1,
  }];
  if (!expandedFolders.has("")) return rows;

  const visited = new Set<FolderPath>([""]);
  const pending = rootChildren.map((path, siblingIndex) => ({
    path,
    depth: 1,
    siblingIndex,
    siblingCount: rootChildren.length,
  })).reverse();
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (visited.has(next.path)) continue;
    visited.add(next.path);
    const descendants = folderChildren.get(next.path) ?? [];
    const expanded = expandedFolders.has(next.path);
    rows.push({
      path: next.path,
      depth: next.depth,
      childCount: descendants.length,
      expanded,
      siblingIndex: next.siblingIndex,
      siblingCount: next.siblingCount,
    });
    if (!expanded || descendants.length === 0) continue;
    for (let index = descendants.length - 1; index >= 0; index -= 1) {
      pending.push({
        path: descendants[index],
        depth: next.depth + 1,
        siblingIndex: index,
        siblingCount: descendants.length,
      });
    }
  }
  return rows;
}

/** Fixed-height virtual window matching the folder row CSS contract. */
export function calculateFolderTreeWindow(
  itemCount: number,
  viewportHeight: number,
  scrollTop: number,
): FolderTreeWindow {
  const count = Math.max(0, Math.floor(itemCount));
  const first = clamp(
    Math.floor((scrollTop - TREE_PADDING_TOP) / FOLDER_TREE_ROW_HEIGHT) - OVERSCAN_ROWS,
    0,
    count,
  );
  const last = clamp(
    Math.ceil((scrollTop + viewportHeight - TREE_PADDING_TOP) / FOLDER_TREE_ROW_HEIGHT) + OVERSCAN_ROWS,
    first,
    count,
  );
  return {
    startIndex: first,
    endIndex: last,
    totalHeight: TREE_PADDING_TOP + count * FOLDER_TREE_ROW_HEIGHT + TREE_PADDING_BOTTOM,
    topForIndex: (index) => TREE_PADDING_TOP + Math.max(0, index) * FOLDER_TREE_ROW_HEIGHT,
  };
}

export function visibleFolderWindowSlice(
  rows: VisibleFolderRow[],
  window: Pick<FolderTreeWindow, "startIndex" | "endIndex">,
): VisibleFolderRow[] {
  return rows.slice(window.startIndex, window.endIndex);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
