import type { ViewportRenderFeatures } from "../viewport-render-graph";
import {
  normalizeViewportRenderFeatures,
  viewportFeatureSetKey,
} from "./viewport-feature-set";
import {
  compileViewportRenderGraphPackage,
  type ViewportRenderGraphPackage,
} from "./viewport-graph-package";

export type ViewportRenderGraphPackageCache = Readonly<{
  get: (features: ViewportRenderFeatures) => ViewportRenderGraphPackage;
  clear: () => void;
  readonly size: number;
}>;

/** Memoizes the finite boolean feature space without retaining runtime GPU state. */
export function createViewportRenderGraphPackageCache(): ViewportRenderGraphPackageCache {
  const packages = new Map<string, ViewportRenderGraphPackage>();
  return Object.freeze({
    get: (requestedFeatures: ViewportRenderFeatures) => {
      const features = normalizeViewportRenderFeatures(requestedFeatures);
      const key = viewportFeatureSetKey(features);
      const existing = packages.get(key);
      if (existing) return existing;
      const compiled = compileViewportRenderGraphPackage(features);
      packages.set(key, compiled);
      return compiled;
    },
    clear: () => packages.clear(),
    get size() {
      return packages.size;
    },
  });
}
