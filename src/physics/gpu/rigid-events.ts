export type RigidPhysicsEvent = { kind: "collision-enter" | "collision-exit" | "trigger-enter" | "trigger-exit"; a: number; b: number; tick: number; aGeneration?: number; bGeneration?: number };
export type RigidEventBatch = { events: RigidPhysicsEvent[]; dropped: number; capacity: number; tick: number };

/** GPU records transitions each tick; CPU reads only in response to an explicit consumer request. */
export function createRigidEvents(device: GPUDevice, bodies: number) {
  const capacity = Math.max(1024, Math.min(65536, bodies * 8));
  const bytes = 16 + capacity * 24;
  if (bytes > device.limits.maxStorageBufferBindingSize || bytes > device.limits.maxBufferSize) throw new Error("Physics event capacity exceeds device storage.");
  const buffer = device.createBuffer({ label: "physics.statusAndEvents", size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const staging = device.createBuffer({ label: "physics.eventReadback", size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  let pending: Promise<RigidEventBatch> | null = null, disposed = false;
  const destroy = () => { buffer.destroy(); staging.destroy(); };
  return {
    buffer, capacity,
    read(): Promise<RigidEventBatch> {
      if (disposed) return Promise.reject(new Error("Physics event world has been released."));
      if (pending) return Promise.reject(new Error("An event read is already pending; await its result before polling again."));
      const encoder = device.createCommandEncoder({ label: "physics.readEvents" });
      encoder.copyBufferToBuffer(buffer, 0, staging, 0, bytes); device.queue.submit([encoder.finish()]);
      // Ordered after the copy and before any subsequent simulation submission.
      device.queue.writeBuffer(buffer, 4, new Uint32Array([0, 0]));
      pending = staging.mapAsync(GPUMapMode.READ).then(() => {
        const values = new Uint32Array(staging.getMappedRange()), events: RigidPhysicsEvent[] = [];
        const count = Math.min(values[1], capacity), tick = values[3], dropped = Math.max(0, values[1] - capacity);
        const kinds = ["collision-enter", "collision-exit", "trigger-enter", "trigger-exit"] as const;
        for (let i = 0; i < count; i++) {
          const at = 4 + i * 6; events.push({ kind: kinds[values[at] - 1], a: values[at + 1], b: values[at + 2], tick: values[at + 3], aGeneration: values[at + 4], bGeneration: values[at + 5] });
        }
        staging.unmap();
        if (disposed) throw new Error("Physics world ended before its events were delivered.");
        return { events, dropped, capacity, tick };
      }).finally(() => { pending = null; if (disposed) destroy(); });
      return pending;
    },
    destroy() { if (disposed) return; disposed = true; if (!pending) destroy(); },
  };
}
