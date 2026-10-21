import type { DockEdge, DockTabPlacement } from "./layout";

type DockDropBounds = {
  width: number;
  height: number;
};

type DockDropPoint = {
  x: number;
  y: number;
};

type SplitEdge = Exclude<DockEdge, "center">;

const EDGE_FRACTION = 0.24;
const EDGE_MINIMUM = 44;
const EDGE_MAXIMUM = 160;

function edgeBand(length: number): number {
  return Math.min(length / 2, Math.min(EDGE_MAXIMUM, Math.max(EDGE_MINIMUM, length * EDGE_FRACTION)));
}

/** Resolves one Unity-style split preview near the closest pane edge. */
export function resolveDockSplitEdge(
  bounds: DockDropBounds,
  point: DockDropPoint,
): SplitEdge | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const horizontalBand = edgeBand(bounds.width);
  const verticalBand = edgeBand(bounds.height);
  const candidates: Array<{ edge: SplitEdge; proximity: number }> = [];

  if (point.x <= horizontalBand) candidates.push({ edge: "left", proximity: point.x / horizontalBand });
  if (point.x >= bounds.width - horizontalBand) {
    candidates.push({ edge: "right", proximity: (bounds.width - point.x) / horizontalBand });
  }
  if (point.y <= verticalBand) candidates.push({ edge: "top", proximity: point.y / verticalBand });
  if (point.y >= bounds.height - verticalBand) {
    candidates.push({ edge: "bottom", proximity: (bounds.height - point.y) / verticalBand });
  }

  candidates.sort((left, right) => left.proximity - right.proximity);
  return candidates[0]?.edge ?? null;
}

/** Uses the hovered tab midpoint as the insertion boundary. */
export function resolveDockTabPlacement(
  pointerX: number,
  tabLeft: number,
  tabWidth: number,
): DockTabPlacement {
  return pointerX < tabLeft + tabWidth / 2 ? "before" : "after";
}
