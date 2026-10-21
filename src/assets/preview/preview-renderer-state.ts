import * as THREE from "three";
import type { ViewportRenderer } from "../../three/renderer";

const PREVIEW_CLEAR_COLOR = 0x1b1e22;
const PREVIEW_EXPOSURE = 1.05;

/** Renders a preview without leaking shared-renderer image or target state. */
export function renderPreviewScene(
  renderer: ViewportRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): void {
  // The common renderer types expose an internal Color4 target even though
  // getClearColor only writes the public RGB fields used by setClearColor.
  const readClearColor = renderer.getClearColor as unknown as (
    target: THREE.Color,
  ) => THREE.Color;
  const clearColor = readClearColor.call(renderer, new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const outputColorSpace = renderer.outputColorSpace;
  const toneMapping = renderer.toneMapping;
  const toneMappingExposure = renderer.toneMappingExposure;
  const autoClear = renderer.autoClear;
  const renderTarget = renderer.getRenderTarget();
  const activeCubeFace = renderer.getActiveCubeFace();
  const activeMipmapLevel = renderer.getActiveMipmapLevel();

  try {
    renderer.setRenderTarget(null);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = PREVIEW_EXPOSURE;
    renderer.autoClear = true;
    renderer.setClearColor(PREVIEW_CLEAR_COLOR, 1);
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(renderTarget, activeCubeFace, activeMipmapLevel);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.outputColorSpace = outputColorSpace;
    renderer.toneMapping = toneMapping;
    renderer.toneMappingExposure = toneMappingExposure;
    renderer.autoClear = autoClear;
  }
}
