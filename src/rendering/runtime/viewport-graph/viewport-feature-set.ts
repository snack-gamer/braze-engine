import type { ViewportRenderFeatures } from "../viewport-render-graph";

const FEATURE_ORDER = [
  "ambientOcclusion",
  "bloom",
  "clouds",
  "godrays",
  "overlays",
  "particleBasePassCompatibility",
  "screenSpaceReflections",
  "shadows",
] as const satisfies readonly (keyof ViewportRenderFeatures)[];

/** Freezes the exact live viewport feature topology. */
export function normalizeViewportRenderFeatures(
  features: ViewportRenderFeatures,
): ViewportRenderFeatures {
  return Object.freeze({
    ambientOcclusion: features.ambientOcclusion,
    bloom: features.bloom,
    clouds: features.clouds,
    godrays: features.godrays,
    overlays: features.overlays,
    particleBasePassCompatibility: features.particleBasePassCompatibility,
    screenSpaceReflections: features.screenSpaceReflections,
    shadows: features.shadows,
  });
}

/** Exact, versioned cache identity for one normalized feature set. */
export function viewportFeatureSetKey(features: ViewportRenderFeatures): string {
  return `viewport-features:v2:${FEATURE_ORDER
    .map((feature) => `${feature}=${features[feature] ? 1 : 0}`)
    .join(";")}`;
}
