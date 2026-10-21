/** Bounded asynchronous diagnostics only; no body poses or solver dependency return to the CPU. */
export function createRigidCapacityDiagnostics(device: GPUDevice, status: GPUBuffer) {
  const staging = device.createBuffer({ label: "physics.capacityDiagnostic", size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  let disposed = false; let pending = false; let encoded = false; let nextSample = 0; let failure: string | null = null;
  return {
    encode(encoder: GPUCommandEncoder) {
      if (pending || performance.now() < nextSample) return;
      encoder.copyBufferToBuffer(status, 0, staging, 0, 4); pending = true; encoded = true;
    },
    afterSubmit() {
      if (!encoded) return; encoded = false;
      void staging.mapAsync(GPUMapMode.READ).then(() => {
        if (disposed) return;
        const code = new Uint32Array(staging.getMappedRange())[0]; staging.unmap();
        if (code) failure = code === 1
          ? "Physics stopped: a body exceeded the reserved 16 simultaneous contact neighbors. Reduce local overlap or increase the contact-memory budget."
          : "Physics stopped: spatial traversal capacity was exceeded.";
      }).catch((error: unknown) => { if (!disposed) failure = `Physics capacity diagnostics failed: ${String(error)}`; })
        .finally(() => { pending = false; nextSample = performance.now() + 1000; });
    },
    checkHealth() { if (failure) throw new Error(failure); },
    destroy() { disposed = true; staging.destroy(); },
  };
}
