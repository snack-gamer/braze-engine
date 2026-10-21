import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import type { FolderPath } from "../../hooks/useAssetFolders";
import {
  FOLDER_TREE_ROW_HEIGHT,
  FOLDER_TREE_VIRTUALIZATION_THRESHOLD,
  calculateFolderTreeWindow,
  visibleFolderWindowSlice,
  type VisibleFolderRow,
} from "./folder-tree-model";

type SidebarMetrics = Readonly<{
  height: number;
  scrollTop: number;
  treeOffset: number;
}>;

/** Measures the existing sidebar scroller and exposes a bounded folder-row window. */
export function useVirtualFolderTree(
  rows: VisibleFolderRow[],
  selectedPath: FolderPath | null,
) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const lastEnsuredSelectionRef = useRef<FolderPath | null>(null);
  const [metrics, setMetrics] = useState<SidebarMetrics>({ height: 0, scrollTop: 0, treeOffset: 0 });
  const virtualized = rows.length > FOLDER_TREE_VIRTUALIZATION_THRESHOLD;

  const measure = useCallback(() => {
    const sidebar = sidebarRef.current;
    const tree = treeRef.current;
    if (!sidebar || !tree) return;
    const next = {
      height: sidebar.clientHeight,
      scrollTop: sidebar.scrollTop,
      treeOffset: tree.getBoundingClientRect().top - sidebar.getBoundingClientRect().top + sidebar.scrollTop,
    };
    setMetrics((previous) => (
      previous.height === next.height
      && previous.scrollTop === next.scrollTop
      && previous.treeOffset === next.treeOffset
        ? previous
        : next
    ));
  }, []);
  useLayoutEffect(() => {
    measure();
    const sidebar = sidebarRef.current;
    if (!sidebar || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [measure]);

  const localScrollTop = Math.max(0, metrics.scrollTop - metrics.treeOffset);
  const treeTopInViewport = metrics.treeOffset - metrics.scrollTop;
  const viewportHeight = Math.max(0, metrics.height - Math.max(0, treeTopInViewport));
  const window = useMemo(
    () => calculateFolderTreeWindow(rows.length, viewportHeight, localScrollTop),
    [localScrollTop, rows.length, viewportHeight],
  );
  const renderedRows = useMemo(
    () => virtualized ? visibleFolderWindowSlice(rows, window) : rows,
    [rows, virtualized, window],
  );

  useEffect(() => {
    if (!virtualized || selectedPath === null) {
      lastEnsuredSelectionRef.current = null;
      return;
    }
    if (lastEnsuredSelectionRef.current === selectedPath) return;
    const selectedIndex = rows.findIndex((row) => row.path === selectedPath);
    const sidebar = sidebarRef.current;
    const tree = treeRef.current;
    if (selectedIndex < 0 || !sidebar || !tree) return;
    lastEnsuredSelectionRef.current = selectedPath;
    const treeOffset = tree.getBoundingClientRect().top
      - sidebar.getBoundingClientRect().top
      + sidebar.scrollTop;
    const rowTop = treeOffset + window.topForIndex(selectedIndex);
    const rowBottom = rowTop + FOLDER_TREE_ROW_HEIGHT;
    let nextScrollTop = sidebar.scrollTop;
    if (rowTop < sidebar.scrollTop) nextScrollTop = rowTop;
    else if (rowBottom > sidebar.scrollTop + sidebar.clientHeight) {
      nextScrollTop = Math.max(0, rowBottom - sidebar.clientHeight);
    }
    if (nextScrollTop === sidebar.scrollTop) return;
    sidebar.scrollTop = nextScrollTop;
    setMetrics((previous) => ({ ...previous, scrollTop: nextScrollTop }));
  }, [rows, selectedPath, virtualized, window]);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setMetrics((previous) => previous.scrollTop === scrollTop ? previous : { ...previous, scrollTop });
  }, []);

  return {
    firstRenderedIndex: virtualized ? window.startIndex : 0,
    onScroll,
    renderedRows,
    sidebarRef,
    totalHeight: window.totalHeight,
    treeRef,
    virtualized,
    topForIndex: window.topForIndex,
  };
}
