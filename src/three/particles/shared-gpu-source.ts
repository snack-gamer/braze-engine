export type ParticleGpuState = Readonly<{
  device: GPUDevice;
  colorFormat: GPUTextureFormat;
}>;

export type ParticleGpuResolution =
  | Readonly<{ status: "ready"; gpu: ParticleGpuState }>
  | Readonly<{ status: "unavailable"; detail: string }>;

export type ParticleGpuProviders = Readonly<{
  device?: () => GPUDevice | null;
  colorFormat?: () => GPUTextureFormat;
}>;

/** Reads the app-owned renderer device synchronously; viewport sync owns retries. */
export function resolveSharedParticleGpu(
  providers: ParticleGpuProviders,
): ParticleGpuResolution {
  if (!providers.device) {
    return { status: "unavailable", detail: "the shared render-session device provider is missing" };
  }
  if (!providers.colorFormat) {
    return { status: "unavailable", detail: "the shared render-session color-format provider is missing" };
  }
  try {
    const device = providers.device();
    if (!device) {
      return { status: "unavailable", detail: "the shared render-session device is not ready" };
    }
    const colorFormat = providers.colorFormat();
    if (typeof colorFormat !== "string" || colorFormat.length === 0) {
      return { status: "unavailable", detail: "the shared render-session color format is invalid" };
    }
    return { status: "ready", gpu: { device, colorFormat } };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "unavailable", detail: `shared render-session device access failed: ${detail}` };
  }
}

/** Coalesces diagnostics while retrying immediate device reads on normal viewport sync. */
export function createSharedParticleGpuResolver(
  providers: ParticleGpuProviders,
  reportUnavailable: (message: string) => void,
): () => ParticleGpuState | null {
  let gpu: ParticleGpuState | null = null;
  let lastFailure = "";
  return () => {
    if (gpu) return gpu;
    const resolved = resolveSharedParticleGpu(providers);
    if (resolved.status === "ready") {
      gpu = resolved.gpu;
      lastFailure = "";
      return gpu;
    }
    if (resolved.detail !== lastFailure) {
      lastFailure = resolved.detail;
      reportUnavailable(`${resolved.detail}; particle initialization will retry on viewport sync.`);
    }
    return null;
  };
}
