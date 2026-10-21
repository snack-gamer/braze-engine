import {
  clampDockRatioForSplit,
  type DockLayoutNode,
  type DockRect,
  type DockSplitterFrame,
} from "./layout";

/** Clamps every nested split against the minimum size of its descendants. */
export function clampDockTreeToRect(node: DockLayoutNode, rect: DockRect): DockLayoutNode {
  if (node.kind === "tabs") return node;
  const available = node.axis === "horizontal" ? rect.width : rect.height;
  const ratio = clampDockRatioForSplit(node, available, node.ratio);
  if (node.axis === "horizontal") {
    const position = rect.x + rect.width * ratio;
    return {
      ...node,
      ratio,
      first: clampDockTreeToRect(node.first, { ...rect, width: rect.width * ratio }),
      second: clampDockTreeToRect(node.second, {
        x: position,
        y: rect.y,
        width: rect.width * (1 - ratio),
        height: rect.height,
      }),
    };
  }
  const position = rect.y + rect.height * ratio;
  return {
    ...node,
    ratio,
    first: clampDockTreeToRect(node.first, { ...rect, height: rect.height * ratio }),
    second: clampDockTreeToRect(node.second, {
      x: rect.x,
      y: position,
      width: rect.width,
      height: rect.height * (1 - ratio),
    }),
  };
}

type WorkspaceBounds = Pick<DOMRect, "left" | "top">;

export function dockRatioFromClientPoint(
  frame: DockSplitterFrame,
  workspace: WorkspaceBounds,
  clientX: number,
  clientY: number,
): number {
  const horizontal = frame.split.axis === "horizontal";
  const available = horizontal ? frame.rect.width : frame.rect.height;
  const localX = clientX - workspace.left;
  const localY = clientY - workspace.top;
  const requested = horizontal
    ? (localX - frame.rect.x) / Math.max(1, frame.rect.width)
    : (localY - frame.rect.y) / Math.max(1, frame.rect.height);
  return clampDockRatioForSplit(frame.split, available, requested);
}

export function dockRatioFromArrowKey(
  frame: DockSplitterFrame,
  key: string,
  shifted: boolean,
): number | null {
  const horizontal = frame.split.axis === "horizontal";
  const decrease = horizontal ? key === "ArrowLeft" : key === "ArrowUp";
  const increase = horizontal ? key === "ArrowRight" : key === "ArrowDown";
  if (!decrease && !increase) return null;
  const available = horizontal ? frame.rect.width : frame.rect.height;
  const step = shifted ? 0.08 : 0.025;
  return clampDockRatioForSplit(
    frame.split,
    available,
    frame.split.ratio + (increase ? step : -step),
  );
}
