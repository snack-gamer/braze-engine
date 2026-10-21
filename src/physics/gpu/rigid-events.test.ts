import { afterEach, expect, it, vi } from "vitest";
import { createRigidEvents } from "./rigid-events";

afterEach(() => vi.unstubAllGlobals());
it("retains readback resources until an outstanding map settles and rejects stale delivery", async () => {
  vi.stubGlobal("GPUBufferUsage", { STORAGE: 1, COPY_SRC: 2, COPY_DST: 4, MAP_READ: 8 });
  vi.stubGlobal("GPUMapMode", { READ: 1 });
  let resolve!: () => void;
  const mapping = new Promise<void>((done) => { resolve = done; });
  const buffer = { destroy: vi.fn() };
  const staging = { destroy: vi.fn(), mapAsync: vi.fn(() => mapping), getMappedRange: () => new ArrayBuffer(16 + 1024 * 24), unmap: vi.fn() };
  const order: string[] = [];
  const device = { limits: { maxStorageBufferBindingSize: 1e7, maxBufferSize: 1e7 },
    createBuffer: vi.fn().mockReturnValueOnce(buffer).mockReturnValueOnce(staging),
    createCommandEncoder: () => ({ copyBufferToBuffer: vi.fn(), finish: () => ({}) }),
    queue: { submit: () => order.push("copy"), writeBuffer: () => order.push("reset") } } as unknown as GPUDevice;
  const events = createRigidEvents(device, 10), pending = events.read();
  expect(order).toEqual(["copy", "reset"]);
  await expect(events.read()).rejects.toThrow("already pending");
  events.destroy(); events.destroy(); expect(buffer.destroy).not.toHaveBeenCalled();
  await expect(events.read()).rejects.toThrow("released");
  resolve(); await expect(pending).rejects.toThrow("ended before");
  expect(staging.unmap).toHaveBeenCalledOnce(); expect(staging.destroy).toHaveBeenCalledOnce(); expect(buffer.destroy).toHaveBeenCalledOnce();
});
