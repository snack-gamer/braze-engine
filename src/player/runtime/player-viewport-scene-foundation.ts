import * as THREE from "three";
import {
  DirectionalLight as WebGpuDirectionalLight,
  HemisphereLight as WebGpuHemisphereLight,
} from "three/webgpu";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CameraGizmo } from "../../lib/camera-gizmo";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { installThreeR184ParticleBasePassBridge } from "../../rendering/adapters/three-webgpu/particles/three-r184-particle-base-pass-bridge";
import { createViewportRenderPipeline } from "../../rendering/adapters/three-webgpu/viewport-render-pipeline";
import { createAssetCache } from "../../three/assets";
import type { EditorGrid } from "../../three/editor-grid";
import { createParticleViewport } from "../../three/particles/viewport";
import {
  webGpuColorFormatFor,
  webGpuDepthFormatFor,
  webGpuDeviceFor,
  webGpuSampleCountFor,
} from "../../three/renderer";
import type { LabelEntry } from "../../three/runtime";
import { createDirectionalShadowRuntime } from "../../three/shadows";
import { createViewportConstructionLifetime } from "../../three/viewport-construction-lifetime";
import { createViewportDiagnostics } from "../../three/viewport-diagnostics";
import { attachViewportRenderSurface } from "../../three/viewport-render-surface-attachment";
import type { ViewportSetupArgs } from "../../three/viewport-setup-types";
import { createPlayerCameraControls } from "./player-camera-controls";

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

/** Game-only foundation: no controls, labels, gizmos, grid, HUD, or picking. */
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
      tabIndex: 0,
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

    const objectRoot = new THREE.Group();
    const labelRoot = new THREE.Group();
    const cameraGizmoRoot = new THREE.Group();
    labelRoot.visible = false;
    cameraGizmoRoot.visible = false;
    scene.add(objectRoot);
    const hemi = new WebGpuHemisphereLight("#d9f6ff", "#3a3328", 0) as THREE.HemisphereLight;
    const key = new WebGpuDirectionalLight("#ffffff", 0) as THREE.DirectionalLight;
    key.position.set(4, 7, 5);
    const directionalShadows = createDirectionalShadowRuntime(renderer, key);
    lifetime.defer(() => directionalShadows.dispose());
    scene.add(hemi, key, key.target);
    const renderPipeline = createViewportRenderPipeline(renderer, scene, camera, key);
    lifetime.defer(() => renderPipeline.dispose());
    const diagnostics = createViewportDiagnostics(args.host);
    lifetime.defer(() => diagnostics.dispose());

    return {
      assetCache,
      camera,
      cameraGizmoMap: new Map<string, CameraGizmo>(),
      cameraGizmoRoot,
      canvas,
      controls: createPlayerCameraControls(camera),
      diagnostics,
      directionalShadows,
      dispose: lifetime.dispose,
      particleBasePassBridge,
      grid: disabledGrid(),
      hemi,
      key,
      labelMap: new Map<string, LabelEntry>(),
      labelRenderer: disabledLabelRenderer(),
      labelRoot,
      objectMap: new Map<string, THREE.Group>(),
      objectRoot,
      particles,
      pointer: Object.freeze({}) as THREE.Vector2,
      raycaster: Object.freeze({}) as THREE.Raycaster,
      renderer,
      rendererBackend: "webgpu" as const,
      renderPipeline,
      renderSurface,
      scene,
      transformControls: disabledTransformControls(),
      viewportHud: null,
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

function disabledTransformControls(): TransformControls {
  const helper = new THREE.Group();
  helper.visible = false;
  return {
    enabled: false,
    dragging: false,
    detach: () => undefined,
    dispose: () => undefined,
    getHelper: () => helper,
  } as unknown as TransformControls;
}

function disabledLabelRenderer(): CSS2DRenderer {
  return {
    domElement: document.createElement("div"),
    setSize: () => undefined,
    render: () => undefined,
  } as unknown as CSS2DRenderer;
}

function disabledGrid(): EditorGrid {
  const object = new THREE.Group();
  object.visible = false;
  return {
    object,
    setVisible: () => undefined,
    setOpacity: () => undefined,
    setColor: () => undefined,
    setExtent: () => undefined,
    setGroundHeight: () => undefined,
    dispose: () => undefined,
  } as unknown as EditorGrid;
}
