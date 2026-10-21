import * as THREE from "three";
import {
  DirectionalLight as WebGpuDirectionalLight,
  HemisphereLight as WebGpuHemisphereLight,
} from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CameraGizmo } from "../lib/camera-gizmo";
import type { BrowserThreeWebGpuRenderSession } from "../rendering/adapters/browser-three-webgpu-session";
import { installThreeR184ParticleBasePassBridge } from "../rendering/adapters/three-webgpu/particles/three-r184-particle-base-pass-bridge";
import { createViewportRenderPipeline } from "../rendering/adapters/three-webgpu/viewport-render-pipeline";
import { createAssetCache } from "./assets";
import { markEditorChrome } from "./editor-chrome";
import { createEditorGrid } from "./editor-grid";
import { customizeTransformGizmo } from "./controls/transform-gizmo-style";
import { createParticleViewport } from "./particles/viewport";
import {
  webGpuColorFormatFor,
  webGpuDepthFormatFor,
  webGpuDeviceFor,
  webGpuSampleCountFor,
} from "./renderer";
import type { LabelEntry } from "./runtime";
import { createDirectionalShadowRuntime } from "./shadows";
import { createViewportConstructionLifetime } from "./viewport-construction-lifetime";
import { createViewportDiagnostics } from "./viewport-diagnostics";
import { createViewportHud } from "./viewport-hud";
import { attachViewportRenderSurface } from "./viewport-render-surface-attachment";
import type { ViewportSetupArgs } from "./viewport-setup-types";

type FoundationArgs = Readonly<{
  host: HTMLDivElement;
  initial: ViewportSetupArgs["initial"];
  renderSession: BrowserThreeWebGpuRenderSession;
  renderSurfaceName: string;
  showStats: boolean;
  onParticleGpuCommitReady: () => void;
  viewportHudHost?: HTMLElement;
}>;

export type ViewportSceneFoundation = ReturnType<typeof createViewportSceneFoundation>;

/** Creates one transactionally-owned scene graph and presentation foundation. */
export function createViewportSceneFoundation(args: FoundationArgs) {
  const lifetime = createViewportConstructionLifetime();
  try {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.01, 150);
    camera.position.set(5.6, 4.2, 6.4);
    const surface = attachViewportRenderSurface({
      host: args.host,
      renderSession: args.renderSession,
      renderSurfaceName: args.renderSurfaceName,
      tabIndex: args.initial.viewportMode === "game" ? 0 : -1,
    });
    lifetime.defer(surface.dispose);
    const { canvas, renderer, renderSurface } = surface;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const assetCache = createAssetCache();
    lifetime.defer(() => assetCache.dispose());
    const particles = createParticleViewport(args.host, {
      colorFormat: () => webGpuColorFormatFor(renderer),
      depthFormat: () => webGpuDepthFormatFor(renderer),
      device: () => webGpuDeviceFor(renderer),
      onGpuCommitReady: args.onParticleGpuCommitReady,
      sampleCount: () => webGpuSampleCountFor(renderer),
    });
    lifetime.defer(() => particles.dispose());
    const particleBasePassBridge = installThreeR184ParticleBasePassBridge({
      scene,
      camera,
      renderer,
      particles,
    });
    lifetime.defer(() => particleBasePassBridge.dispose());

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = "scene-label-layer";
    lifetime.defer(() => labelRenderer.domElement.remove());
    args.host.appendChild(labelRenderer.domElement);
    const controls = createOrbitControls(camera, canvas, args.initial.viewportMode);
    lifetime.defer(() => controls.dispose());
    const transformControls = createTransformControls(
      scene,
      camera,
      canvas,
      args.initial.transformMode,
    );
    lifetime.defer(() => {
      transformControls.detach();
      scene.remove(transformControls.getHelper());
      transformControls.dispose();
    });

    const objectRoot = new THREE.Group();
    const labelRoot = new THREE.Group();
    const cameraGizmoRoot = new THREE.Group();
    markEditorChrome(cameraGizmoRoot);
    scene.add(objectRoot, labelRoot, cameraGizmoRoot);
    const hemi = new WebGpuHemisphereLight("#d9f6ff", "#3a3328", 0) as THREE.HemisphereLight;
    const key = new WebGpuDirectionalLight("#ffffff", 0) as THREE.DirectionalLight;
    key.position.set(4, 7, 5);
    const directionalShadows = createDirectionalShadowRuntime(renderer, key);
    lifetime.defer(() => directionalShadows.dispose());
    scene.add(hemi, key, key.target);
    const renderPipeline = createViewportRenderPipeline(renderer, scene, camera, key);
    lifetime.defer(() => renderPipeline.dispose());
    const grid = createEditorGrid({
      color: args.initial.gridColor,
      size: args.initial.gridHorizon,
      opacity: args.initial.gridOpacity,
      visible: args.initial.showGrid,
      groundHeight: 0.002,
    });
    scene.add(grid.object);
    lifetime.defer(() => {
      scene.remove(grid.object);
      grid.dispose();
    });
    const viewportHud = args.initial.viewportMode === "game"
      ? createViewportHud(args.viewportHudHost ?? args.host)
      : null;
    if (viewportHud) lifetime.defer(() => viewportHud.destroy());
    viewportHud?.setVisible(args.showStats);
    const diagnostics = createViewportDiagnostics(args.host);
    lifetime.defer(() => diagnostics.dispose());

    return {
      assetCache,
      camera,
      cameraGizmoMap: new Map<string, CameraGizmo>(),
      cameraGizmoRoot,
      canvas,
      controls,
      diagnostics,
      directionalShadows,
      dispose: lifetime.dispose,
      particleBasePassBridge,
      grid,
      hemi,
      key,
      labelMap: new Map<string, LabelEntry>(),
      labelRenderer,
      labelRoot,
      objectMap: new Map<string, THREE.Group>(),
      objectRoot,
      particles,
      pointer: new THREE.Vector2(),
      raycaster: new THREE.Raycaster(),
      renderer,
      rendererBackend: "webgpu" as const,
      renderPipeline,
      renderSurface,
      scene,
      transformControls,
      viewportHud,
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

function createOrbitControls(
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  viewportMode: "scene" | "game",
): OrbitControls {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.target.set(0, 0.5, 0);
  controls.zoomToCursor = true;
  controls.zoomSpeed = 0.85;
  controls.mouseButtons.LEFT = null;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.enabled = viewportMode === "scene";
  return controls;
}

function createTransformControls(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
  mode: ViewportSetupArgs["initial"]["transformMode"],
): TransformControls {
  const controls = new TransformControls(camera, canvas);
  try {
    controls.setMode(mode);
    controls.space = "world";
    controls.size = 0.7;
    controls.translationSnap = null;
    controls.rotationSnap = null;
    controls.scaleSnap = null;
    controls.enabled = false;
    controls.getHelper().visible = false;
    markEditorChrome(controls.getHelper());
    scene.add(controls.getHelper());
    customizeTransformGizmo(controls);
    return controls;
  } catch (error) {
    scene.remove(controls.getHelper());
    controls.dispose();
    throw error;
  }
}
