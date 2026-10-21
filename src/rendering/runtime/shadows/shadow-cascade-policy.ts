import type { ShadowCascadeSplit, ShadowCascadeTier } from "./shadow-cascade-splits";

export type ShadowWorldPosition = Readonly<{ x: number; y: number; z: number }>;
export type ShadowCameraCell = Readonly<{ x: number; y: number; z: number }>;

export type ShadowCascadePolicy = Readonly<{
  tier: ShadowCascadeTier;
  split: ShadowCascadeSplit;
  mapSize: 512 | 1024 | 2048;
  maximumScreenErrorPixels: 0.5 | 1 | 2;
  casterScope: "static-and-dynamic" | "static-only";
  cameraTracking: "pose-generation" | "snapped-cell";
  cameraCellWorldSize: number | null;
}>;

const QUALITY = Object.freeze({
  near: Object.freeze({ mapSize: 2048, maximumScreenErrorPixels: 0.5 }),
  mid: Object.freeze({ mapSize: 1024, maximumScreenErrorPixels: 1 }),
  far: Object.freeze({ mapSize: 512, maximumScreenErrorPixels: 2 }),
} as const);

/** Applies the fixed screen-error budget and map-size tier to calculated splits. */
export function createShadowCascadePolicies(
  splits: readonly ShadowCascadeSplit[],
): readonly ShadowCascadePolicy[] {
  if (splits.length !== 3) throw new RangeError("Directional shadows require exactly three cascades.");
  return Object.freeze(splits.map((split) => {
    const quality = QUALITY[split.tier];
    const cameraTracking = split.tier === "near" ? "pose-generation" : "snapped-cell";
    return Object.freeze({
      tier: split.tier,
      split,
      mapSize: quality.mapSize,
      maximumScreenErrorPixels: quality.maximumScreenErrorPixels,
      casterScope: split.tier === "far" ? "static-only" : "static-and-dynamic",
      cameraTracking,
      cameraCellWorldSize: cameraTracking === "snapped-cell"
        ? (split.far * 2 * quality.maximumScreenErrorPixels) / quality.mapSize
        : null,
    });
  }));
}

export function snapShadowCameraCell(
  position: ShadowWorldPosition,
  cellWorldSize: number,
): ShadowCameraCell {
  if (!Number.isFinite(cellWorldSize) || cellWorldSize <= 0) {
    throw new RangeError("Shadow camera cell size must be finite and greater than zero.");
  }
  return Object.freeze({
    x: snapIndex(position.x, cellWorldSize),
    y: snapIndex(position.y, cellWorldSize),
    z: snapIndex(position.z, cellWorldSize),
  });
}

function snapIndex(value: number, cellWorldSize: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Shadow camera position must be finite.");
  const index = Math.round(value / cellWorldSize);
  return Object.is(index, -0) ? 0 : index;
}
