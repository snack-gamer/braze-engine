import type { ClonerSettings } from "../../types";
import { hashU32, type V3 } from "../braze-effectors";
import {
  radialArcClosed,
  radialDecode,
  radialPathU,
  radialRingSize,
  radialRingStart,
  radialSegmentAtU,
} from "./distribution";

export function sourceIndexFor(
  cloner: ClonerSettings,
  cloneIndex: number,
  sourceCount: number,
): number {
  if (sourceCount <= 1) return 0;
  if (cloner.sourceMode === "random") {
    const base = cloneIndex % sourceCount;
    const group = Math.floor(cloneIndex / sourceCount);
    return (base + (hashU32((group ^ cloner.seed) >>> 0) % sourceCount)) % sourceCount;
  }
  return cloneIndex % sourceCount;
}

export function localDistributionBounds(
  cloner: ClonerSettings,
  total: number,
  localPositions: V3[],
): { min: V3; max: V3 } {
  if (cloner.mode === "grid") {
    const nx = Math.max(1, Math.round(cloner.gridCount[0]));
    const ny = Math.max(1, Math.round(cloner.gridCount[1]));
    const nz = Math.max(1, Math.round(cloner.gridCount[2]));
    const size: V3 = [
      Math.abs((nx - 1) * cloner.gridSpacing[0]) + 0.001,
      Math.abs((ny - 1) * cloner.gridSpacing[1]) + 0.001,
      Math.abs((nz - 1) * cloner.gridSpacing[2]) + 0.001,
    ];
    const centre: V3 = cloner.gridCenter
      ? [0, 0, 0]
      : [((nx - 1) * cloner.gridSpacing[0]) / 2, ((ny - 1) * cloner.gridSpacing[1]) / 2, ((nz - 1) * cloner.gridSpacing[2]) / 2];
    return {
      min: [centre[0] - size[0] / 2, centre[1] - size[1] / 2, centre[2] - size[2] / 2],
      max: [centre[0] + size[0] / 2, centre[1] + size[1] / 2, centre[2] + size[2] / 2],
    };
  }
  if (cloner.mode === "linear") {
    const end: V3 = [
      cloner.linearStep[0] * Math.max(0, total - 1),
      cloner.linearStep[1] * Math.max(0, total - 1),
      cloner.linearStep[2] * Math.max(0, total - 1),
    ];
    return {
      min: [Math.min(0, end[0]) - 0.0005, Math.min(0, end[1]) - 0.0005, Math.min(0, end[2]) - 0.0005],
      max: [Math.max(0, end[0]) + 0.0005, Math.max(0, end[1]) + 0.0005, Math.max(0, end[2]) + 0.0005],
    };
  }
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const position of localPositions) {
    for (let axis = 0; axis < 3; axis++) {
      if (position[axis] < min[axis]) min[axis] = position[axis];
      if (position[axis] > max[axis]) max[axis] = position[axis];
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0.001, 0.001, 0.001] };
  return {
    min: [min[0] - 0.0005, min[1] - 0.0005, min[2] - 0.0005],
    max: [max[0] + 0.0005, max[1] + 0.0005, max[2] + 0.0005],
  };
}

export function neighborsFor(cloner: ClonerSettings, index: number, total: number): number[] {
  const neighbors: number[] = [];
  if (cloner.mode === "grid") {
    const nx = Math.max(1, Math.round(cloner.gridCount[0]));
    const ny = Math.max(1, Math.round(cloner.gridCount[1]));
    const nz = Math.max(1, Math.round(cloner.gridCount[2]));
    const x = index % nx;
    const y = Math.floor(index / nx) % ny;
    const z = Math.floor(index / (nx * ny));
    if (x > 0) neighbors.push(index - 1);
    if (x + 1 < nx) neighbors.push(index + 1);
    if (y > 0) neighbors.push(index - nx);
    if (y + 1 < ny) neighbors.push(index + nx);
    const slice = nx * ny;
    if (z > 0) neighbors.push(index - slice);
    if (z + 1 < nz) neighbors.push(index + slice);
  } else if (cloner.mode === "radial") {
    const { ring, segment, segments, start } = radialDecode(cloner, index);
    const closed = radialArcClosed(cloner);
    if (segment > 0) neighbors.push(index - 1);
    else if (closed && segments > 2) neighbors.push(start + segments - 1);
    if (segment + 1 < segments) neighbors.push(index + 1);
    else if (closed && segments > 2) neighbors.push(start);
    const u = radialPathU(segment, segments, closed);
    if (ring > 0) {
      const innerSegments = radialRingSize(cloner, ring - 1);
      neighbors.push(radialRingStart(cloner, ring - 1) + radialSegmentAtU(u, innerSegments, closed));
    }
    if (ring + 1 < Math.max(1, cloner.radialRings)) {
      const outerSegments = radialRingSize(cloner, ring + 1);
      neighbors.push(radialRingStart(cloner, ring + 1) + radialSegmentAtU(u, outerSegments, closed));
    }
  } else {
    if (index > 0) neighbors.push(index - 1);
    if (index + 1 < total) neighbors.push(index + 1);
  }
  return neighbors;
}
