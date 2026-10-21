import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { readPixelToken } from "../../ui/theme-tokens";
import { HIERARCHY_ROW_HEIGHT } from "../hierarchy-window";
import type { HierarchyDensity } from "../hierarchy-density";

/**
 * Row height as `theme.css` defines it (`--hierarchy-row-h`), so windowing math
 * always matches paint. A density change re-reads the token and rescales the
 * scroll offset, keeping the same rows in view.
 */
export function useHierarchyRowHeight(listRef: RefObject<HTMLElement | null>, density: HierarchyDensity): number {
  const [rowHeight, setRowHeight] = useState(HIERARCHY_ROW_HEIGHT);
  const appliedHeight = useRef(HIERARCHY_ROW_HEIGHT);
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const next = readPixelToken(node, "--hierarchy-row-h", HIERARCHY_ROW_HEIGHT);
    if (next !== appliedHeight.current) {
      node.scrollTop = (node.scrollTop / appliedHeight.current) * next;
      appliedHeight.current = next;
    }
    setRowHeight(next);
  }, [listRef, density]);
  return rowHeight;
}
