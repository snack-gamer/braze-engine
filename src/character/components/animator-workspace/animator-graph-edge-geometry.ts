import {
  animatorGraphNodeSize,
  type AnimatorGraphEdge,
  type AnimatorGraphNode,
} from "../../application/animator-graph-model";
import type { AnimatorGraphPoint } from "./animator-graph-viewport";

const PREFERRED_LANE_GAP = 12;
const MAX_LANE_SPREAD = 36;

export type AnimatorGraphEdgeGeometry = Readonly<{
  path: string;
  start: AnimatorGraphPoint;
  end: AnimatorGraphPoint;
  midpoint: AnimatorGraphPoint;
  arrowAngleDegrees: number;
}>;

type NodeRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

/** Connects the nearest boundaries with one untwisted Unity-style line. */
export function animatorGraphEdgeGeometry(
  source: AnimatorGraphNode,
  destination: AnimatorGraphNode,
  laneOffset = 0,
): AnimatorGraphEdgeGeometry {
  const sourceRect = nodeRect(source);
  const destinationRect = nodeRect(destination);
  const sourceCenter = rectCenter(sourceRect);
  const destinationCenter = rectCenter(destinationRect);
  const direction = normalizedDirection(sourceCenter, destinationCenter);
  const normal = { x: -direction.y, y: direction.x };
  const shiftedSource = addScaled(sourceCenter, normal, laneOffset);
  const shiftedDestination = addScaled(destinationCenter, normal, laneOffset);
  const start = rectangleBoundaryPoint(sourceRect, shiftedSource, direction);
  const end = rectangleBoundaryPoint(destinationRect, shiftedDestination, {
    x: -direction.x,
    y: -direction.y,
  });
  return lineGeometry(start, end);
}

/** Free previews end at the pointer; snapped previews meet the target boundary. */
export function animatorGraphPreviewGeometry(
  source: AnimatorGraphNode,
  pointer: AnimatorGraphPoint,
  destination?: AnimatorGraphNode,
): AnimatorGraphEdgeGeometry {
  if (destination) return animatorGraphEdgeGeometry(source, destination);
  const sourceRect = nodeRect(source);
  const center = rectCenter(sourceRect);
  const direction = normalizedDirection(center, pointer);
  return lineGeometry(
    rectangleBoundaryPoint(sourceRect, center, direction),
    pointer,
  );
}

/**
 * Allocates lanes by unordered node pair. Reverse transitions therefore use
 * separate parallel lanes instead of drawing the same path backwards.
 */
export function animatorGraphConnectionLaneOffsets(
  edges: readonly AnimatorGraphEdge[],
): ReadonlyMap<AnimatorGraphEdge, number> {
  const groups = new Map<string, AnimatorGraphEdge[]>();
  for (const edge of edges) {
    const key = unorderedPairKey(edge.sourceNodeId, edge.destinationNodeId);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const offsets = new Map<AnimatorGraphEdge, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort(compareEdges);
    const gap = sorted.length <= 1
      ? 0
      : Math.min(PREFERRED_LANE_GAP, MAX_LANE_SPREAD / (sorted.length - 1));
    const canonicalSource = canonicalPairStart(sorted[0]!.sourceNodeId, sorted[0]!.destinationNodeId);
    sorted.forEach((edge, index) => {
      const physicalOffset = (index - (sorted.length - 1) / 2) * gap;
      offsets.set(edge, edge.sourceNodeId === canonicalSource ? physicalOffset : -physicalOffset);
    });
  }
  return offsets;
}

function nodeRect(node: AnimatorGraphNode): NodeRect {
  const size = animatorGraphNodeSize(node);
  return { left: node.x, top: node.y, width: size.width, height: size.height };
}

function rectCenter(rect: NodeRect): AnimatorGraphPoint {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function normalizedDirection(from: AnimatorGraphPoint, to: AnimatorGraphPoint): AnimatorGraphPoint {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);
  return length > 1.0e-6 ? { x: x / length, y: y / length } : { x: 1, y: 0 };
}

function addScaled(
  point: AnimatorGraphPoint,
  vector: AnimatorGraphPoint,
  scale: number,
): AnimatorGraphPoint {
  return { x: point.x + vector.x * scale, y: point.y + vector.y * scale };
}

function rectangleBoundaryPoint(
  rect: NodeRect,
  origin: AnimatorGraphPoint,
  direction: AnimatorGraphPoint,
): AnimatorGraphPoint {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const center = rectCenter(rect);
  const safeOrigin = {
    x: Math.min(center.x + halfWidth, Math.max(center.x - halfWidth, origin.x)),
    y: Math.min(center.y + halfHeight, Math.max(center.y - halfHeight, origin.y)),
  };
  const xDistance = direction.x > 0
    ? center.x + halfWidth - safeOrigin.x
    : direction.x < 0 ? safeOrigin.x - (center.x - halfWidth) : Number.POSITIVE_INFINITY;
  const yDistance = direction.y > 0
    ? center.y + halfHeight - safeOrigin.y
    : direction.y < 0 ? safeOrigin.y - (center.y - halfHeight) : Number.POSITIVE_INFINITY;
  const distance = Math.min(
    Math.abs(direction.x) > 1.0e-6 ? xDistance / Math.abs(direction.x) : Number.POSITIVE_INFINITY,
    Math.abs(direction.y) > 1.0e-6 ? yDistance / Math.abs(direction.y) : Number.POSITIVE_INFINITY,
  );
  return {
    x: safeOrigin.x + direction.x * distance,
    y: safeOrigin.y + direction.y * distance,
  };
}

function lineGeometry(
  start: AnimatorGraphPoint,
  end: AnimatorGraphPoint,
): AnimatorGraphEdgeGeometry {
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const arrowAngleDegrees = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  return {
    path: `M ${coordinate(start.x)} ${coordinate(start.y)} L ${coordinate(end.x)} ${coordinate(end.y)}`,
    start,
    end,
    midpoint,
    arrowAngleDegrees,
  };
}

function unorderedPairKey(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function canonicalPairStart(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? left : right;
}

function compareEdges(left: AnimatorGraphEdge, right: AnimatorGraphEdge): number {
  return left.sourceNodeId.localeCompare(right.sourceNodeId)
    || left.destinationNodeId.localeCompare(right.destinationNodeId)
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id);
}

function coordinate(value: number): string {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
