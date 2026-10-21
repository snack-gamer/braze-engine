/** Fallback only: `theme.css` owns the row height (`--hierarchy-row-h`) and the list reads it. */
export const HIERARCHY_ROW_HEIGHT = 24;
export const HIERARCHY_WINDOW_OVERSCAN = 8;

export type HierarchyWindowRange = {
  start: number;
  end: number;
  beforeHeight: number;
  afterHeight: number;
};

export function hierarchyWindowRange(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = HIERARCHY_ROW_HEIGHT,
  overscan = HIERARCHY_WINDOW_OVERSCAN,
): HierarchyWindowRange {
  const count = Math.max(0, Math.floor(rowCount));
  if (count === 0) return { start: 0, end: 0, beforeHeight: 0, afterHeight: 0 };
  const safeHeight = Math.max(1, rowHeight);
  const visibleCount = Math.max(1, Math.ceil(Math.max(1, viewportHeight) / safeHeight));
  const firstVisible = Math.min(
    Math.max(0, count - visibleCount),
    Math.floor(Math.max(0, scrollTop) / safeHeight),
  );
  const start = Math.max(0, Math.min(count, firstVisible - Math.max(0, overscan)));
  const end = Math.max(start, Math.min(count, firstVisible + visibleCount + Math.max(0, overscan)));
  return {
    start,
    end,
    beforeHeight: start * safeHeight,
    afterHeight: (count - end) * safeHeight,
  };
}
