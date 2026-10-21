import type { ResourceCacheDiagnostics } from "../../three/resources/leased-resource-cache";

const EMPTY_DIAGNOSTICS: ResourceCacheDiagnostics = Object.freeze({
  entries: 0,
  activeEntries: 0,
  idleEntries: 0,
  references: 0,
  estimatedBytes: 0,
  idleEstimatedBytes: 0,
  maxIdleEntries: 0,
  maxIdleBytes: 0,
  evictions: 0,
  failedLoads: 0,
});

export function acquireEnvTexture(): never {
  throw new Error("This player was compiled for a Sky environment and contains no HDRI loader.");
}

export function environmentTextureDiagnostics(): ResourceCacheDiagnostics {
  return EMPTY_DIAGNOSTICS;
}
