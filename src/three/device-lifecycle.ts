export type RendererFailureDiagnostic = Readonly<{
  kind: "initialization" | "device-lost";
  reason: string;
  message: string;
}>;

type DeviceLossInfo = {
  reason?: string;
  message?: string;
};

type ObservableGpuDevice = {
  lost: Promise<DeviceLossInfo>;
};

/** Observes one device and suppresses completion after viewport disposal. */
export function observeGpuDeviceLoss(
  device: ObservableGpuDevice,
  onLost: (diagnostic: RendererFailureDiagnostic) => void,
): () => void {
  let active = true;
  void device.lost.then((info) => {
    if (!active) return;
    const reason = info.reason || "unknown";
    const detail = info.message?.trim();
    onLost({
      kind: "device-lost",
      reason,
      message: detail
        ? `WebGPU device lost (${reason}): ${detail}`
        : `WebGPU device lost (${reason}).`,
    });
  });
  return () => {
    active = false;
  };
}

export function rendererInitializationDiagnostic(error: unknown): RendererFailureDiagnostic {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    kind: "initialization",
    reason: "initialization-failed",
    message: `WebGPU renderer initialization failed: ${detail}`,
  };
}
