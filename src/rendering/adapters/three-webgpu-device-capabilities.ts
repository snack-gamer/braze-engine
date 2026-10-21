/** Exact feature order consumed by Three r184's WebGPU backend. */
export const THREE_R184_DEVICE_FEATURES = Object.freeze([
  "core-features-and-limits",
  "depth-clip-control",
  "depth32float-stencil8",
  "texture-compression-bc",
  "texture-compression-bc-sliced-3d",
  "texture-compression-etc2",
  "texture-compression-astc",
  "texture-compression-astc-sliced-3d",
  "timestamp-query",
  "indirect-first-instance",
  "shader-f16",
  "rg11b10ufloat-renderable",
  "bgra8unorm-storage",
  "float32-filterable",
  "float32-blendable",
  "clip-distances",
  "dual-source-blending",
  "subgroups",
  "texture-formats-tier1",
  "texture-formats-tier2",
] satisfies readonly GPUFeatureName[]);

/** Three features which are safe to enable whenever the adapter advertises them. */
export const THREE_R184_OPTIONAL_DEVICE_FEATURES = Object.freeze(
  THREE_R184_DEVICE_FEATURES.filter((feature) => (
    feature !== "core-features-and-limits" && feature !== "timestamp-query"
  )),
);

/** Minimums used by the engine's current physics and GPU-particle shader families. */
export const BRAZE_WEBGPU_REQUIRED_LIMITS = Object.freeze({
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxStorageBuffersInVertexStage: 2,
});

export type ThreeWebGpuCapabilityPolicy = Readonly<{
  gpuTimingEnabled: boolean;
}>;

export type ThreeWebGpuDeviceCapabilityProfile = Readonly<{
  featureLevel: "core";
  requiredFeatures: readonly GPUFeatureName[];
  requiredLimits: Readonly<Record<keyof typeof BRAZE_WEBGPU_REQUIRED_LIMITS, number>>;
  optionalFeatures: readonly GPUFeatureName[];
  diagnosticFeatures: readonly GPUFeatureName[];
  timestampQueries: boolean;
  fallbackAdapter: boolean;
}>;

/**
 * Compiles and validates the immutable app-owned device profile before the
 * adapter is consumed. Compatibility-mode devices are deliberately rejected:
 * the current physics and particle shaders do not have compatibility variants.
 */
export function compileThreeWebGpuDeviceCapabilityProfile(
  adapter: Pick<GPUAdapter, "features" | "limits" | "info">,
  policy: ThreeWebGpuCapabilityPolicy,
): ThreeWebGpuDeviceCapabilityProfile {
  if (!adapter.features.has("core-features-and-limits")) {
    throw new Error(
      "Braze Engine requires a core WebGPU adapter; compatibility-mode shader variants are not available.",
    );
  }
  validateRequiredLimits(adapter.limits);
  const optionalFeatures = Object.freeze(THREE_R184_OPTIONAL_DEVICE_FEATURES.filter(
    (feature) => adapter.features.has(feature),
  ));
  const diagnosticFeatures = Object.freeze(
    policy.gpuTimingEnabled && adapter.features.has("timestamp-query")
      ? ["timestamp-query" as GPUFeatureName]
      : [],
  );
  const requiredFeatures = Object.freeze([
    "core-features-and-limits" as GPUFeatureName,
    ...optionalFeatures,
    ...diagnosticFeatures,
  ]);
  return Object.freeze({
    featureLevel: "core" as const,
    requiredFeatures,
    requiredLimits: BRAZE_WEBGPU_REQUIRED_LIMITS,
    optionalFeatures,
    diagnosticFeatures,
    timestampQueries: diagnosticFeatures.length > 0,
    fallbackAdapter: adapter.info.isFallbackAdapter,
  });
}

/** Selects the stable r184 feature intersection in deterministic order. */
export function selectThreeWebGpuDeviceFeatures(
  supported: Pick<GPUSupportedFeatures, "has">,
  policy: ThreeWebGpuCapabilityPolicy,
): readonly GPUFeatureName[] {
  return Object.freeze(THREE_R184_DEVICE_FEATURES.filter((feature) => (
    supported.has(feature)
    && (feature !== "timestamp-query" || policy.gpuTimingEnabled)
  )));
}

function validateRequiredLimits(limits: GPUSupportedLimits): void {
  for (const [name, required] of Object.entries(BRAZE_WEBGPU_REQUIRED_LIMITS)) {
    const supported = limits[name as keyof typeof BRAZE_WEBGPU_REQUIRED_LIMITS];
    if (typeof supported === "number" && supported >= required) continue;
    throw new Error(
      `WebGPU adapter limit '${name}' must be at least ${required}; received ${String(supported)}.`,
    );
  }
}
