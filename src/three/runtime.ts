import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CameraGizmo } from "../lib/camera-gizmo";
import type {
  DirectionalLightSettings,
  ModifierPinSelection,
  ScenePlaybackMode,
  SkySettings,
  Vec3,
} from "../types";
import type { AssetCache } from "./assets";
import type { MotionMixerState } from "./animation";
import type { ParticleViewport } from "./particles/viewport";
import type { ViewportRenderer, ViewportRendererBackend } from "./renderer";
import type { ViewportRenderPipeline } from "../rendering/adapters/three-webgpu/viewport-render-pipeline";
import type { ThreeReflectionProbeSessionLane } from "../rendering/adapters/three-webgpu/reflections/three-reflection-probe-session-lane";
import type { RootMotionSink } from "../character/runtime/root-motion";
import type { EditorGrid } from "./editor-grid";
export type { ObjectTransformPatch } from "../scene/authoring/live-transform";

export type BodyKind =
  | "primitive"
  | "water"
  | "image"
  | "particle"
  | "placeholder"
  | "asset"
  | "camera-body"
  | "directional-light-body"
  | "none";

export type NodeUserData = {
  sceneObjectNode: true;
  objectId: string;
  bodyKind: BodyKind;
  bodyKey: string;
  materialKey: string;
  assetLoadKey?: string;
  assetLoadRelease?: () => void;
  assetLoadGeneration: number;
};

export type ModifierHandleSelection = ModifierPinSelection;
export type ColliderHandleSelection =
  | { objectId: string; colliderId: string; kind: "center" }
  | {
      objectId: string;
      colliderId: string;
      kind: "face";
      axis: 0 | 1 | 2;
      direction: -1 | 1;
    };

export type LabelEntry = {
  object: CSS2DObject;
  element: HTMLDivElement;
  identity: string;
  tag: string;
  color: string;
  active: boolean;
};

export type SkyRuntime = {
  applySettings: (settings: SkySettings) => void;
  setSunDirectionOverride: (direction: Vec3 | null) => void;
  dispose: () => void;
  update: () => void;
};

export type Runtime = {
  /** Session lifetime guard checked by every deferred runtime completion. */
  disposed: boolean;
  renderer: ViewportRenderer;
  rendererBackend: ViewportRendererBackend;
  labelRenderer: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  focusSelection: () => void;
  transformControls: TransformControls;
  objectRoot: THREE.Group;
  labelRoot: THREE.Group;
  objectMap: Map<string, THREE.Group>;
  labelMap: Map<string, LabelEntry>;
  assetCache: AssetCache;
  motionMixers: Map<string, MotionMixerState>;
  /** Scene objects whose pose is temporarily owned by a clockless editor preview. */
  editorPosePreviewObjectIds: Set<string>;
  grid: EditorGrid;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  requestFrame?: () => void;
  resizeViewport: () => void;
  bbox: THREE.Box3;
  cameraGizmoRoot: THREE.Group;
  cameraGizmoMap: Map<string, CameraGizmo>;
  modifierStates: Map<string, unknown>;
  modifierHandleMap: Map<string, THREE.Object3D>;
  selectedModifierHandle: ModifierHandleSelection | null;
  colliderGizmoMap: Map<string, THREE.Object3D>;
  colliderHandleMap: Map<string, THREE.Object3D>;
  selectedColliderHandle: ColliderHandleSelection | null;
  clonerOutputs: Map<string, THREE.Group>;
  clonerSignatures: Map<string, string>;
  clonersDirty: boolean;
  scenePlaybackMode: ScenePlaybackMode;
  animationPreviewMode: boolean;
  pendingAssetLoads: Set<string>;
  failedAssetLoads: Map<string, string>;
  environmentReady: boolean;
  renderFrame: number;
  framesSinceSceneChange: number;
  lastRenderStatusKey: string;
  onRenderStatusChange?: (status: SceneRenderStatus) => void;
  worldLights: {
    hemisphere: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    keyOffset: THREE.Vector3;
  };
  /** True when an enabled, hierarchy-visible Directional Light owns the shared
   * key. With no active authored light, direct lighting is suppressed while
   * the environment continues to provide ambient/IBL illumination. */
  authoredDirectionalLightActive: boolean;
  authoredDirectionalLightObjectId: string | null;
  authoredDirectionalLightSettings: DirectionalLightSettings | null;
  authoredDirectionalLightDirection: THREE.Vector3 | null;
  particles: ParticleViewport;
  renderPipeline: ViewportRenderPipeline;
  reflectionProbe: ThreeReflectionProbeSessionLane;
  /** Invalidates the exact cached shadow tiers affected by an ephemeral transform. */
  invalidateShadowCasterTransform: (objectId: string) => void;
  /** Cold material-graph lifetime boundary, independent of shadow motion. */
  invalidateShadowCasterMaterials?: () => void;
  characterMotorFor?: (objectId: string) => RootMotionSink;
  sky: SkyRuntime | null;
  // Dirty flag for label positions. World positions only change when a node's
  // transform or body changes — so we recompute on diff-sync and skip the
  // per-frame bbox.setFromObject traversal (~60x/sec) the rest of the time.
  labelsDirty: boolean;
};

export const PLACEHOLDER = "placeholder";

export const SETTLED_FRAME_COUNT = 3;

export type SceneRenderStatus = {
  ready: boolean;
  pendingAssets: number;
  failedAssets: number;
  environmentReady: boolean;
  framesSinceSceneChange: number;
  message: string;
};

export const initialSceneRenderStatus: SceneRenderStatus = {
  ready: false,
  pendingAssets: 0,
  failedAssets: 0,
  environmentReady: false,
  framesSinceSceneChange: 0,
  message: "Starting renderer",
};

export function markSceneDirty(runtime: Runtime): void {
  if (runtime.disposed) return;
  runtime.framesSinceSceneChange = 0;
  runtime.requestFrame?.();
}

export function sceneNeedsSettling(runtime: Runtime): boolean {
  return !runtime.disposed && runtime.framesSinceSceneChange < SETTLED_FRAME_COUNT;
}

function sceneRenderStatus(runtime: Runtime): SceneRenderStatus {
  const pendingAssets = runtime.pendingAssetLoads.size;
  const failedAssets = runtime.failedAssetLoads.size;
  const settled = runtime.framesSinceSceneChange >= SETTLED_FRAME_COUNT;
  const ready = pendingAssets === 0 && failedAssets === 0 && runtime.environmentReady && settled;
  let message = "Ready";
  if (pendingAssets > 0) message = `Loading ${pendingAssets} asset${pendingAssets === 1 ? "" : "s"}`;
  else if (failedAssets > 0) message = `${failedAssets} asset${failedAssets === 1 ? "" : "s"} failed`;
  else if (!runtime.environmentReady) message = "Loading environment";
  else if (!settled) message = "Settling renderer";

  return {
    ready,
    pendingAssets,
    failedAssets,
    environmentReady: runtime.environmentReady,
    framesSinceSceneChange: runtime.framesSinceSceneChange,
    message,
  };
}

export function emitSceneRenderStatus(runtime: Runtime): void {
  if (runtime.disposed || !runtime.onRenderStatusChange) return;
  const status = sceneRenderStatus(runtime);
  const key = [
    status.ready ? "ready" : "busy",
    status.pendingAssets,
    status.failedAssets,
    status.environmentReady ? "env" : "no-env",
    Math.min(status.framesSinceSceneChange, SETTLED_FRAME_COUNT),
    status.message,
  ].join("|");
  if (key === runtime.lastRenderStatusKey) return;
  runtime.lastRenderStatusKey = key;
  runtime.onRenderStatusChange?.(status);
}
