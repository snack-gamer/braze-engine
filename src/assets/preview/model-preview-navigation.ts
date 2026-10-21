import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  frameModelPreviewCamera,
  updateModelPreviewClippingPlanes,
} from "./model-preview-camera";
import {
  resolveModelPreviewResolution,
  type ModelPreviewResolution,
} from "./model-preview-resolution";
import { createPreviewResourceLifetime } from "./preview-resource-lifetime";

export type ModelPreviewViewState = Readonly<{
  atDefault: boolean;
  azimuth: number;
  polar: number;
  distance: number;
}>;

export type ModelPreviewNavigationOptions = Readonly<{
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resizeSurface: (resolution: ModelPreviewResolution) => boolean;
  requestRender: () => void;
  onViewState: (view: ModelPreviewViewState) => void;
  onFailure: () => void;
}>;

/** Owns interactive model-preview camera input, framing, and canvas sizing. */
export class ModelPreviewNavigation {
  private readonly releaseBindings: () => void;
  private bounds: THREE.Sphere | null = null;
  private interactionActive = false;
  private viewAtDefault = true;
  private cssWidth = 0;
  private cssHeight = 0;
  private pixelRatio = 0;
  private lastViewStateKey = "";
  private disposed = false;

  constructor(private readonly options: ModelPreviewNavigationOptions) {
    const bindings = createPreviewResourceLifetime("model preview navigation binding");
    try {
      options.controls.addEventListener("start", this.handleControlsStart);
      bindings.defer(() => options.controls.removeEventListener("start", this.handleControlsStart));
      options.controls.addEventListener("end", this.handleControlsEnd);
      bindings.defer(() => options.controls.removeEventListener("end", this.handleControlsEnd));
      options.controls.addEventListener("change", this.handleControlsChange);
      bindings.defer(() => options.controls.removeEventListener("change", this.handleControlsChange));
      options.controls.listenToKeyEvents(options.canvas);
      bindings.defer(() => options.controls.stopListenToKeyEvents());
      options.canvas.addEventListener("pointerdown", this.focusCanvas);
      bindings.defer(() => options.canvas.removeEventListener("pointerdown", this.focusCanvas));
      options.canvas.addEventListener("keydown", this.handleKeyDown);
      bindings.defer(() => options.canvas.removeEventListener("keydown", this.handleKeyDown));
      const resizeObserver = new ResizeObserver(this.resize);
      bindings.defer(() => resizeObserver.disconnect());
      resizeObserver.observe(options.canvas);
      this.resize();
      this.releaseBindings = bindings.dispose;
    } catch (error) {
      bindings.dispose();
      throw error;
    }
  }

  setBounds(bounds: THREE.Sphere | null): void {
    this.bounds = bounds;
  }

  resetView(): void {
    if (!this.bounds || this.disposed) return;
    this.viewAtDefault = true;
    frameModelPreviewCamera(this.options.camera, this.options.controls, this.bounds);
    this.emitViewState();
    this.options.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseBindings();
  }

  private readonly focusCanvas = (): void => {
    this.options.canvas.focus({ preventScroll: true });
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "f" || event.key === "F" || event.key === "Home" || event.key === "0") {
      event.preventDefault();
      this.resetView();
      return;
    }
    if (event.key.startsWith("Arrow")) this.viewAtDefault = false;
  };

  private readonly handleControlsStart = (): void => {
    this.interactionActive = true;
  };

  private readonly handleControlsEnd = (): void => {
    this.interactionActive = false;
  };

  private readonly handleControlsChange = (): void => {
    if (this.interactionActive) this.viewAtDefault = false;
    if (this.bounds) updateModelPreviewClippingPlanes(this.options.camera, this.bounds);
    this.emitViewState();
    this.options.requestRender();
  };

  private readonly resize = (): void => {
    if (this.disposed) return;
    const rect = this.options.canvas.getBoundingClientRect();
    const resolution = resolveModelPreviewResolution(
      rect.width,
      rect.height,
      window.devicePixelRatio,
    );
    if (
      resolution.cssWidth === this.cssWidth
      && resolution.cssHeight === this.cssHeight
      && resolution.pixelRatio === this.pixelRatio
    ) return;
    this.cssWidth = resolution.cssWidth;
    this.cssHeight = resolution.cssHeight;
    this.pixelRatio = resolution.pixelRatio;
    if (!this.options.resizeSurface(resolution)) {
      this.options.onFailure();
      return;
    }
    this.options.camera.aspect = resolution.aspect;
    this.options.camera.updateProjectionMatrix();
    if (this.bounds && this.viewAtDefault) this.resetView();
    else this.options.requestRender();
  };

  private emitViewState(): void {
    const view = {
      atDefault: this.viewAtDefault,
      azimuth: this.options.controls.getAzimuthalAngle(),
      polar: this.options.controls.getPolarAngle(),
      distance: this.options.controls.getDistance(),
    };
    const key = `${view.atDefault ? 1 : 0}|${view.azimuth}|${view.polar}|${view.distance}`;
    if (key === this.lastViewStateKey) return;
    this.lastViewStateKey = key;
    this.options.onViewState(view);
  }
}
