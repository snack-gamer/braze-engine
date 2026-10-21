import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AssetCatalogEntry } from "./asset-catalog";
import type { ItemKey, ViewMode } from "./types";
import {
  ASSET_VIRTUALIZATION_THRESHOLD,
  calculateAssetVirtualWindow,
} from "./virtual-window";

type VirtualAssetViewportProps = {
  items: readonly AssetCatalogEntry[];
  viewMode: ViewMode;
  tileSize: number;
  swatchSize: number;
  selectedKeys: ReadonlySet<ItemKey>;
  focusedKey: ItemKey | null;
  viewIdentity: string;
  leadingItem?: ReactNode;
  emptyContent?: ReactNode;
  dropActive: boolean;
  renderItem: (item: AssetCatalogEntry) => ReactNode;
  itemClassName: (item: AssetCatalogEntry, index: number, columns: number) => string;
  onItemContextMenu: (event: React.MouseEvent, item: AssetCatalogEntry) => void;
  onItemDragStart: (event: React.DragEvent, item: AssetCatalogEntry) => void;
  onItemDragEnd: () => void;
  onEmptyContextMenu: (event: React.MouseEvent) => void;
  onEmptyClick: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
};

type ViewportMetrics = { width: number; height: number; scrollTop: number };

export function VirtualAssetViewport(props: VirtualAssetViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedKeyRef = useRef<ItemKey | null>(null);
  const [metrics, setMetrics] = useState<ViewportMetrics>({ width: 0, height: 0, scrollTop: 0 });
  const leadingCount = props.leadingItem ? 1 : 0;
  const logicalCount = props.items.length + leadingCount;
  const virtualized = logicalCount > ASSET_VIRTUALIZATION_THRESHOLD;

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setMetrics((previous) => {
      const next = { width: viewport.clientWidth, height: viewport.clientHeight, scrollTop: viewport.scrollTop };
      return previous.width === next.width && previous.height === next.height && previous.scrollTop === next.scrollTop
        ? previous
        : next;
    });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.scrollTop === 0) return;
    viewport.scrollTop = 0;
    setMetrics((previous) => ({ ...previous, scrollTop: 0 }));
  }, [props.viewIdentity]);

  const virtualWindow = useMemo(() => calculateAssetVirtualWindow({
    mode: props.viewMode,
    itemCount: logicalCount,
    viewportWidth: metrics.width,
    viewportHeight: metrics.height,
    scrollTop: metrics.scrollTop,
    tileSize: props.tileSize,
    swatchSize: props.swatchSize,
  }), [logicalCount, metrics, props.swatchSize, props.tileSize, props.viewMode]);

  useEffect(() => {
    if (!virtualized || !props.focusedKey || lastFocusedKeyRef.current === props.focusedKey) return;
    const catalogIndex = props.items.findIndex((item) => item.key === props.focusedKey);
    if (catalogIndex < 0) return;
    lastFocusedKeyRef.current = props.focusedKey;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const position = virtualWindow.positionFor(catalogIndex + leadingCount);
    const itemTop = position.y;
    const itemBottom = position.y + position.height;
    if (itemTop < viewport.scrollTop) viewport.scrollTop = itemTop;
    else if (itemBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = Math.max(0, itemBottom - viewport.clientHeight);
    }
  }, [leadingCount, props.focusedKey, props.items, virtualized, virtualWindow]);

  useEffect(() => {
    if (!props.focusedKey) lastFocusedKeyRef.current = null;
  }, [props.focusedKey]);

  const sharedProps = {
    onContextMenu: props.onEmptyContextMenu,
    onDragOver: props.onDragOver,
    onDragLeave: props.onDragLeave,
    onDrop: props.onDrop,
  };

  return (
    <div
      ref={viewportRef}
      className={`assets__tiles ${props.viewMode === "list" ? "list" : ""} ${
        props.dropActive ? "asset-drop-active" : ""
      } ${virtualized ? "assets__tiles--virtualized" : ""}`}
      role="listbox"
      aria-label="Assets"
      aria-multiselectable="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onEmptyClick();
      }}
      onScroll={(event) => {
        const target = event.currentTarget;
        setMetrics((previous) => ({ ...previous, scrollTop: target.scrollTop }));
      }}
      {...sharedProps}
    >
      {virtualized ? (
        <div
          className="assets__virtual-space"
          style={{ height: virtualWindow.totalHeight }}
          onClick={(event) => {
            if (event.target === event.currentTarget) props.onEmptyClick();
          }}
        >
          {Array.from({ length: virtualWindow.endIndex - virtualWindow.startIndex }, (_, offset) => {
            const logicalIndex = virtualWindow.startIndex + offset;
            const position = virtualWindow.positionFor(logicalIndex);
            if (props.leadingItem && logicalIndex === 0) {
              return (
                <div key="create-folder" className="assets__virtual-cell" style={cellStyle(position)}>
                  {props.leadingItem}
                </div>
              );
            }
            const item = props.items[logicalIndex - leadingCount];
            return item ? renderCell(props, item, logicalIndex, virtualWindow.columns, position) : null;
          })}
        </div>
      ) : (
        <>
          {props.leadingItem && <div className="assets__item-cell">{props.leadingItem}</div>}
          {props.items.map((item, index) => renderCell(
            props,
            item,
            index + leadingCount,
            virtualWindow.columns,
          ))}
          {logicalCount === 0 && props.emptyContent}
        </>
      )}
    </div>
  );
}

function renderCell(
  props: VirtualAssetViewportProps,
  item: AssetCatalogEntry,
  logicalIndex: number,
  columns: number,
  position?: { x: number; y: number; width: number; height: number },
) {
  return (
    <div
      key={item.key}
      className={`assets__item-cell ${position ? "assets__virtual-cell" : ""} ${props.itemClassName(
        item,
        logicalIndex - (props.leadingItem ? 1 : 0),
        columns,
      )}`}
      style={position ? cellStyle(position) : undefined}
      role="option"
      aria-selected={props.selectedKeys.has(item.key)}
      aria-posinset={logicalIndex - (props.leadingItem ? 1 : 0) + 1}
      aria-setsize={props.items.length}
      data-asset-key={item.key}
      onContextMenu={(event) => props.onItemContextMenu(event, item)}
      onDragStart={(event) => props.onItemDragStart(event, item)}
      onDragEnd={props.onItemDragEnd}
    >
      {props.renderItem(item)}
    </div>
  );
}

function cellStyle(position: { x: number; y: number; width: number; height: number }) {
  return {
    position: "absolute",
    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    width: position.width,
    height: position.height,
  } as const;
}
