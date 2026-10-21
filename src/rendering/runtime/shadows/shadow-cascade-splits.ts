export type ShadowCascadeTier = "near" | "mid" | "far";

export type ShadowCameraRange = Readonly<{
  near: number;
  far: number;
  maxShadowDistance: number;
}>;

export type ShadowCascadeSplit = Readonly<{
  index: 0 | 1 | 2;
  tier: ShadowCascadeTier;
  near: number;
  far: number;
}>;

const TIERS = ["near", "mid", "far"] as const;

/** Standard practical split: a weighted blend of uniform and logarithmic depth. */
export function calculateShadowCascadeSplits(
  camera: ShadowCameraRange,
  practicalLambda = 0.65,
): readonly ShadowCascadeSplit[] {
  validateRange(camera);
  if (!Number.isFinite(practicalLambda) || practicalLambda < 0 || practicalLambda > 1) {
    throw new RangeError("Shadow practical split lambda must be between 0 and 1.");
  }
  const shadowFar = Math.min(camera.far, camera.maxShadowDistance);
  if (shadowFar <= camera.near) {
    throw new RangeError("Maximum shadow distance must be greater than the camera near plane.");
  }
  const splits: ShadowCascadeSplit[] = [];
  let splitNear = camera.near;
  for (let index = 0 as 0 | 1 | 2; index < TIERS.length; index = (index + 1) as 0 | 1 | 2) {
    const fraction = (index + 1) / TIERS.length;
    const logarithmic = camera.near * Math.pow(shadowFar / camera.near, fraction);
    const uniform = camera.near + (shadowFar - camera.near) * fraction;
    const splitFar = index === 2
      ? shadowFar
      : logarithmic * practicalLambda + uniform * (1 - practicalLambda);
    splits.push(Object.freeze({ index, tier: TIERS[index], near: splitNear, far: splitFar }));
    splitNear = splitFar;
  }
  return Object.freeze(splits);
}

function validateRange(camera: ShadowCameraRange): void {
  if (!Number.isFinite(camera.near) || camera.near <= 0) {
    throw new RangeError("Shadow camera near plane must be finite and greater than zero.");
  }
  if (!Number.isFinite(camera.far) || camera.far <= camera.near) {
    throw new RangeError("Shadow camera far plane must be finite and greater than its near plane.");
  }
  if (!Number.isFinite(camera.maxShadowDistance) || camera.maxShadowDistance <= 0) {
    throw new RangeError("Maximum shadow distance must be finite and greater than zero.");
  }
}
