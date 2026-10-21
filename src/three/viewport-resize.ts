import type * as THREE from "three";
import type { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { resolveCameraPreviewAspect } from "../camera/domain/camera-preview-aspect";
import { viewportPixelRatio } from "./viewport-performance";

type Size = { width: number; height: number };
type AspectConsumer = { refreshAspect: (aspect: number) => void };
export type ViewportOutputSurface = Readonly<{
  resize: (size: { width: number; height: number; pixelRatio: number }) => boolean;
}>;

type ViewportResizeArgs = {
  camera: THREE.PerspectiveCamera;
  cameraPreviewAspect: { current: number | null };
  cameraGizmos: () => Iterable<AspectConsumer>;
  host: HTMLElement;
  labelRenderer: CSS2DRenderer;
  lowResolution: { current: boolean };
  onResize: () => void;
  renderSize: { current: Size | null };
  outputSurface: ViewportOutputSurface;
};

export type ViewportResizeController = {
  dispose: () => void;
  flush: () => void;
  getPixelRatio: () => number;
  schedule: () => void;
};

export function createViewportResizeController(args: ViewportResizeArgs): ViewportResizeController {
  let resizeFrame: number | null = null;
  let lastSignature = "";
  let currentPixelRatio = 1;

  const flush = () => {
    resizeFrame = null;
    const viewportWidth = Math.max(1, args.host.clientWidth);
    const viewportHeight = Math.max(1, args.host.clientHeight);
    const requested = args.renderSize.current;
    const renderWidth = requested?.width ?? viewportWidth;
    const renderHeight = requested?.height ?? viewportHeight;
    const cameraAspect = renderWidth / renderHeight;
    const previewAspect = resolveCameraPreviewAspect(args.cameraPreviewAspect.current, cameraAspect);
    const pixelRatio = viewportPixelRatio({
      devicePixelRatio: window.devicePixelRatio,
      fixedRenderSize: Boolean(requested),
      lowResolution: args.lowResolution.current,
    });
    const signature = [
      viewportWidth,
      viewportHeight,
      renderWidth,
      renderHeight,
      pixelRatio,
      previewAspect,
    ].join(":");
    if (signature === lastSignature) return;
    lastSignature = signature;

    currentPixelRatio = pixelRatio;
    args.camera.aspect = cameraAspect;
    args.camera.updateProjectionMatrix();
    args.outputSurface.resize({ width: renderWidth, height: renderHeight, pixelRatio });
    args.labelRenderer.setSize(viewportWidth, viewportHeight);
    for (const gizmo of args.cameraGizmos()) gizmo.refreshAspect(previewAspect);
    args.onResize();
  };

  const schedule = () => {
    if (resizeFrame !== null) return;
    resizeFrame = window.requestAnimationFrame(flush);
  };

  return {
    flush,
    getPixelRatio: () => currentPixelRatio,
    schedule,
    dispose: () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    },
  };
}
