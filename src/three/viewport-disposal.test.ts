import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { ViewportSceneFoundation } from "./viewport-scene-foundation";
import { createViewportDisposer } from "./viewport-disposal";

describe("viewport disposal", () => {
  it("continues releasing later owners when an earlier cleanup throws", () => {
    const foundationDispose = vi.fn();
    const schedulerDispose = vi.fn();
    const physicsDispose = vi.fn();
    const probeDispose = vi.fn();
    const resizeDispose = vi.fn();
    const emitterDispose = vi.fn();
    const navigationDestroy = vi.fn();
    const observerDisconnect = vi.fn();
    const inputsDispose = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const renderer = {} as never;
    const runtimeRef = { current: null };
    const foundation = {
      renderer,
      scene: new THREE.Scene(),
      transformControls: {
        detach: () => { throw new Error("detach failed"); },
        getHelper: () => new THREE.Group(),
      },
      labelMap: new Map(),
      cameraGizmoMap: new Map(),
      cameraGizmoRoot: new THREE.Group(),
      objectMap: new Map(),
      objectRoot: new THREE.Group(),
      dispose: foundationDispose,
    } as unknown as ViewportSceneFoundation;
    const dispose = createViewportDisposer({
      runtimeRef,
      foundation,
      physicsPlayback: { dispose: physicsDispose } as never,
      scheduler: {
        cancelFrame: () => { throw new Error("cancel failed"); },
        dispose: schedulerDispose,
      } as never,
      viewportResize: { dispose: resizeDispose },
      emitter: { dispose: emitterDispose },
      navigation: { destroy: navigationDestroy },
      resizeObserver: { disconnect: observerDisconnect },
      inputs: { dispose: inputsDispose },
      reflectionProbe: { dispose: probeDispose },
    });

    dispose();
    dispose();

    expect(schedulerDispose).toHaveBeenCalledOnce();
    expect(resizeDispose).toHaveBeenCalledOnce();
    expect(emitterDispose).toHaveBeenCalledOnce();
    expect(navigationDestroy).toHaveBeenCalledOnce();
    expect(observerDisconnect).toHaveBeenCalledOnce();
    expect(inputsDispose).toHaveBeenCalledOnce();
    expect(physicsDispose).toHaveBeenCalledOnce();
    expect(probeDispose).toHaveBeenCalledOnce();
    expect(foundationDispose).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
