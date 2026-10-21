import type * as THREE from "three";

/** Compile-time player topology for scenes with no authored particle effects. */
export function createParticleViewport() {
  return {
    isActive: () => false,
    syncGpuForAdmittedRender: () => undefined,
    tickGpuForAdmittedRender: () => undefined,
    renderToPass: (
      _pass: GPURenderPassEncoder,
      _camera: THREE.Camera,
      _targetState?: unknown,
    ) => undefined,
    dispose: () => undefined,
  };
}

export function createParticleAdmittedFrameController() {
  return Object.freeze({
    observeFrame: (_deltaSeconds: number, _playbackActive: boolean) => false,
    prepareRender: () => undefined,
  });
}
