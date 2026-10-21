import type { MutableRefObject } from "react";
import type { BrowserThreeWebGpuRenderSession } from "../rendering/adapters/browser-three-webgpu-session";
import type {
  CameraState,
  ColliderComponent,
  EnvironmentSettings,
  ModifierPinSelection,
  PhysicsWorldSettings,
  SceneObject,
  ScenePlaybackMode,
  TransformMode,
} from "../types";
import type { RuntimeModifierPlan } from "./modifiers/runtime";
import type { ObjectTransformPatch, Runtime, SceneRenderStatus } from "./runtime";
import type { ViewportFrameRate } from "./viewport-frame-rate";

export type ViewportCallbacks = {
  onSelectObject: (id: string) => void;
  onCameraChange: (camera: CameraState) => void;
  onTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onPreviewTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onUpdateModifierPin: (
    objectId: string,
    modifierId: string,
    pinId: string,
    localOffset: [number, number, number],
  ) => void;
  onUpdateCollider: (objectId: string, colliderId: string, patch: Partial<ColliderComponent>) => void;
  onSelectModifierPin: (selection: ModifierPinSelection | null) => void;
  onRenderStatusChange?: (status: SceneRenderStatus) => void;
  onViewportFrameRate?: (frameRate: ViewportFrameRate) => void;
};

export type ViewportSetupArgs = {
  host: HTMLDivElement;
  renderSession: BrowserThreeWebGpuRenderSession;
  renderSurfaceName: string;
  viewportHudHost?: HTMLElement;
  initial: {
    viewportMode: "scene" | "game";
    renderSize: { width: number; height: number } | null;
    lowResolution: boolean;
    transformMode: TransformMode;
    showGrid: boolean;
    animationPreviewMode: boolean;
    environment: EnvironmentSettings;
    gridOpacity: number;
    gridColor: string;
    gridHorizon: number;
  };
  runtimeRef: MutableRefObject<Runtime | null>;
  objectsRef: MutableRefObject<SceneObject[]>;
  /** Immutable Play input; presentation may exclude runtime-destroyed objects. */
  physicsObjectsRef?: MutableRefObject<SceneObject[]>;
  hasAnimatedClonersRef: MutableRefObject<boolean>;
  modifierPlanRef: MutableRefObject<RuntimeModifierPlan>;
  scenePlaybackModeRef: MutableRefObject<ScenePlaybackMode>;
  physicsStepTokenRef: MutableRefObject<number>;
  physicsWorldSettingsRef: MutableRefObject<PhysicsWorldSettings>;
  showStatsRef: MutableRefObject<boolean>;
  renderSizeRef: MutableRefObject<{ width: number; height: number } | null>;
  lowResolutionRef: MutableRefObject<boolean>;
  cameraPreviewAspectRef: MutableRefObject<number | null>;
  callbacksRef: MutableRefObject<ViewportCallbacks>;
  activeObjectIdRef: MutableRefObject<string>;
  lastEmittedCameraRef: MutableRefObject<CameraState | null>;
  onRendererReady?: () => void;
};
