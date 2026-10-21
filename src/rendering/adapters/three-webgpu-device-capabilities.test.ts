import { describe, expect, it } from "vitest";
import {
  BRAZE_WEBGPU_REQUIRED_LIMITS,
  compileThreeWebGpuDeviceCapabilityProfile,
  selectThreeWebGpuDeviceFeatures,
  THREE_R184_DEVICE_FEATURES,
} from "./three-webgpu-device-capabilities";

function adapterWith(
  features: readonly GPUFeatureName[],
  limits: Partial<GPUSupportedLimits> = {},
): Pick<GPUAdapter, "features" | "limits" | "info"> {
  return {
    features: new Set(features),
    limits: {
      ...BRAZE_WEBGPU_REQUIRED_LIMITS,
      ...limits,
    } as unknown as GPUSupportedLimits,
    info: { isFallbackAdapter: false } as GPUAdapterInfo,
  };
}

describe("Three WebGPU device capability policy", () => {
  it("compiles an immutable core profile and keeps timestamps diagnostic-only", () => {
    const adapter = adapterWith([
      "core-features-and-limits",
      "texture-compression-bc",
      "shader-f16",
      "timestamp-query",
    ]);

    const normal = compileThreeWebGpuDeviceCapabilityProfile(adapter, { gpuTimingEnabled: false });
    expect(normal).toMatchObject({
      featureLevel: "core",
      requiredFeatures: [
        "core-features-and-limits",
        "texture-compression-bc",
        "shader-f16",
      ],
      requiredLimits: BRAZE_WEBGPU_REQUIRED_LIMITS,
      diagnosticFeatures: [],
      timestampQueries: false,
      fallbackAdapter: false,
    });
    expect(Object.isFrozen(normal)).toBe(true);
    expect(Object.isFrozen(normal.requiredFeatures)).toBe(true);

    const diagnostic = compileThreeWebGpuDeviceCapabilityProfile(adapter, { gpuTimingEnabled: true });
    expect(diagnostic.requiredFeatures).toEqual([
      "core-features-and-limits",
      "texture-compression-bc",
      "shader-f16",
      "timestamp-query",
    ]);
    expect(diagnostic.timestampQueries).toBe(true);
  });

  it("rejects compatibility mode before requesting a device", () => {
    expect(() => compileThreeWebGpuDeviceCapabilityProfile(
      adapterWith(["timestamp-query"]),
      { gpuTimingEnabled: true },
    )).toThrow("requires a core WebGPU adapter");
  });

  it.each([
    ["maxComputeInvocationsPerWorkgroup", 255],
    ["maxComputeWorkgroupSizeX", 128],
    ["maxStorageBuffersInVertexStage", 1],
    ["maxStorageBuffersInVertexStage", undefined],
  ] as const)("rejects insufficient %s support", (name, value) => {
    expect(() => compileThreeWebGpuDeviceCapabilityProfile(
      adapterWith(["core-features-and-limits"], { [name]: value }),
      { gpuTimingEnabled: false },
    )).toThrow(`limit '${name}' must be at least`);
  });

  it("preserves Three r184's exact deterministic supported intersection", () => {
    const supported = new Set<GPUFeatureName>(THREE_R184_DEVICE_FEATURES);
    expect(selectThreeWebGpuDeviceFeatures(supported, { gpuTimingEnabled: true })).toEqual(
      THREE_R184_DEVICE_FEATURES,
    );
    expect(selectThreeWebGpuDeviceFeatures(supported, { gpuTimingEnabled: false }))
      .not.toContain("timestamp-query");
  });
});
