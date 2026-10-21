import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CustomTextureStore,
  type CustomTextureDecoder,
} from "../../../vendor/particles/packages/gpu/src/custom-texture-store";
import { createParticleAdmittedFrameController } from "./admitted-frame-controller";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}>;

describe("particle custom-texture admission", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not touch the GPU when async decode completes before admitted sync", async () => {
    vi.stubGlobal("GPUTextureUsage", {
      TEXTURE_BINDING: 1,
      COPY_DST: 2,
      RENDER_ATTACHMENT: 4,
    });
    const decoded = deferred<ImageBitmap>();
    const requestFrame = vi.fn();
    const store = new CustomTextureStore({
      decode: () => decoded.promise,
      onCommitReady: requestFrame,
    });
    const { device, createTexture, copyExternalImageToTexture } = fakeDevice();
    const bitmap = fakeBitmap();
    store.stage(["texture-a"]);

    const rebuildBindGroup = vi.fn();
    const tickGpuForAdmittedRender = vi.fn();
    const syncGpuForAdmittedRender = vi.fn(() => {
      if (store.commit(device)) rebuildBindGroup();
    });
    const controller = createParticleAdmittedFrameController({
      particles: () => ({
        isActive: () => true,
        syncGpuForAdmittedRender,
        tickGpuForAdmittedRender,
      }),
      objects: () => [],
      objectMap: new Map(),
      basePassBridge: { setEnabled: vi.fn() },
    });

    decoded.resolve(bitmap);
    await decoded.promise;
    await Promise.resolve();
    controller.observeFrame(0.016, false);

    expect(syncGpuForAdmittedRender).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(createTexture).not.toHaveBeenCalled();
    expect(copyExternalImageToTexture).not.toHaveBeenCalled();
    expect(rebuildBindGroup).not.toHaveBeenCalled();
    expect(bitmap.close).not.toHaveBeenCalled();

    controller.prepareRender();

    expect(syncGpuForAdmittedRender).toHaveBeenCalledOnce();
    expect(tickGpuForAdmittedRender).not.toHaveBeenCalled();
    expect(createTexture).toHaveBeenCalledOnce();
    expect(copyExternalImageToTexture).toHaveBeenCalledOnce();
    expect(rebuildBindGroup).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("keeps only the latest desired decode and closes stale or disposed results", async () => {
    vi.stubGlobal("GPUTextureUsage", {
      TEXTURE_BINDING: 1,
      COPY_DST: 2,
      RENDER_ATTACHMENT: 4,
    });
    const decodes = new Map<string, Deferred<ImageBitmap>>();
    const signals = new Map<string, AbortSignal>();
    const decode: CustomTextureDecoder = (src, signal) => {
      const pending = deferred<ImageBitmap>();
      decodes.set(src, pending);
      signals.set(src, signal);
      return pending.promise;
    };
    const requestFrame = vi.fn();
    const store = new CustomTextureStore({ decode, onCommitReady: requestFrame });
    const { device, createTexture } = fakeDevice();
    const stale = fakeBitmap();
    const latest = fakeBitmap();

    store.stage(["stale"]);
    store.stage(["latest"]);
    expect(signals.get("stale")?.aborted).toBe(true);
    decodes.get("stale")?.resolve(stale);
    decodes.get("latest")?.resolve(latest);
    await Promise.all([
      decodes.get("stale")?.promise,
      decodes.get("latest")?.promise,
    ]);
    await Promise.resolve();

    expect(stale.close).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(createTexture).not.toHaveBeenCalled();
    store.commit(device);
    expect(createTexture).toHaveBeenCalledOnce();
    expect(store.get("stale")).toBeUndefined();
    expect(store.get("latest")).toBeDefined();

    const afterDispose = fakeBitmap();
    store.stage(["after-dispose"]);
    store.dispose();
    expect(signals.get("after-dispose")?.aborted).toBe(true);
    decodes.get("after-dispose")?.resolve(afterDispose);
    await decodes.get("after-dispose")?.promise;
    await Promise.resolve();

    expect(afterDispose.close).toHaveBeenCalledOnce();
    expect(createTexture).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it("coalesces multiple current decode completions into one bounded commit wakeup", async () => {
    vi.stubGlobal("GPUTextureUsage", {
      TEXTURE_BINDING: 1,
      COPY_DST: 2,
      RENDER_ATTACHMENT: 4,
    });
    const first = deferred<ImageBitmap>();
    const second = deferred<ImageBitmap>();
    const requestFrame = vi.fn();
    const store = new CustomTextureStore({
      decode: (src) => src === "first" ? first.promise : second.promise,
      onCommitReady: requestFrame,
    });
    const { device, createTexture, copyExternalImageToTexture } = fakeDevice();
    store.stage(["first", "second"]);

    first.resolve(fakeBitmap());
    second.resolve(fakeBitmap());
    await Promise.all([first.promise, second.promise]);
    await Promise.resolve();

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(createTexture).not.toHaveBeenCalled();
    store.commit(device);
    expect(createTexture).toHaveBeenCalledTimes(2);
    expect(copyExternalImageToTexture).toHaveBeenCalledTimes(2);
    store.commit(device);
    expect(createTexture).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeBitmap(): ImageBitmap {
  return {
    width: 8,
    height: 4,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

function fakeDevice(): {
  device: GPUDevice;
  createTexture: ReturnType<typeof vi.fn>;
  copyExternalImageToTexture: ReturnType<typeof vi.fn>;
} {
  const createTexture = vi.fn(() => ({ destroy: vi.fn() } as unknown as GPUTexture));
  const copyExternalImageToTexture = vi.fn();
  const device = {
    createTexture,
    queue: { copyExternalImageToTexture },
  } as unknown as GPUDevice;
  return { device, createTexture, copyExternalImageToTexture };
}
