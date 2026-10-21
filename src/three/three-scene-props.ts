import type { RefObject } from "react";
import type { AnimationDocument } from "../animation/types";
import type { ImportedClipPreviewSubscription } from "../animation/application/imported-clip-preview-channel";
import type { AnimatorPlaybackBinding } from "../character/application/playback/animator-playback-binding";
import type { CharacterRuntimeDiagnostic } from "../character/runtime/diagnostics";
import type { ColliderEditSelection } from "../physics/authoring/collider-edit";
import type { LiveTransformSubscription } from "../scene/authoring/live-transform";
import type { PrimeTimelineSample } from "../timeline/types";
import type {
  CameraState,
  ColliderComponent,
  DepthOfFieldComponent,
  EnvironmentSettings,
  Material,
  ModifierPinSelection,
  PhysicsWorldSettings,
  SceneObject,
  ScenePlaybackMode,
  TransformMode,
  TransformSpace,
} from "../types";
import type { AssetAnimationClipInfo } from "./assets";
import type { ObjectTransformPatch, SceneRenderStatus } from "./runtime";
import type { ViewportFrameRate } from "./viewport-frame-rate";

/** Public composition contract for one Scene or Game viewport. */
export type ThreeSceneProps = {
  viewportMode?: "scene" | "game";
  showStats?: boolean;
  viewportHudHostRef?: RefObject<HTMLElement | null>;
  renderSize?: { width: number; height: number } | null;
  lowResolution?: boolean;
  objects: SceneObject[];
  materials: Material[];
  activeObjectId: string;
  transformMode: TransformMode;
  showTransformControls: boolean;
  showEditorOverlays: boolean;
  showObjectLabels: boolean;
  showCameraGizmos: boolean;
  showGrid: boolean;
  transformSpace: TransformSpace;
  transformSnapping: boolean;
  translationSnap: number;
  rotationSnapDegrees: number;
  scaleSnap: number;
  transformGizmoSize: number;
  focusSelectionToken: number;
  animationPreviewMode?: boolean;
  scenePlaybackMode: ScenePlaybackMode;
  physicsStepToken: number;
  physicsWorldSettings: PhysicsWorldSettings;
  editingCollider: ColliderEditSelection | null;
  environment: EnvironmentSettings;
  activeCameraId: string;
  cameraPreviewAspect?: number | null;
  cameraTransform: CameraState;
  cameraNear: number;
  cameraFar: number;
  cameraDepthOfField: DepthOfFieldComponent | null;
  // Opacity updates live; baked grid color/horizon changes rebuild the helper.
  gridOpacity: number;
  gridColor: string;
  gridHorizon: number;
  onSelectObject: (id: string) => void;
  onCameraChange: (camera: CameraState) => void;
  onTransformObject: (id: string, transform: ObjectTransformPatch) => void;
  onPreviewTransformObject?: (id: string, transform: ObjectTransformPatch) => void;
  onUpdateModifierPin: (
    objectId: string,
    modifierId: string,
    pinId: string,
    localOffset: [number, number, number],
  ) => void;
  onUpdateCollider: (
    objectId: string,
    colliderId: string,
    patch: Partial<ColliderComponent>,
  ) => void;
  selectedModifierPin: ModifierPinSelection | null;
  onSelectModifierPin: (selection: ModifierPinSelection | null) => void;
  onRenderStatusChange?: (status: SceneRenderStatus) => void;
  onViewportFrameRate?: (frameRate: ViewportFrameRate) => void;
  animationDocument?: AnimationDocument;
  animationBaseObjects?: SceneObject[];
  subscribeTimelineFrame?: (listener: (sample: PrimeTimelineSample) => void) => () => void;
  onAssetAnimationsDiscovered?: (objectId: string, clips: AssetAnimationClipInfo[]) => void;
  subscribeLiveObjectTransform?: LiveTransformSubscription;
  onAnimatorPlaybackBindingChange?: (binding: AnimatorPlaybackBinding | null) => void;
  subscribeImportedClipPreview?: ImportedClipPreviewSubscription;
  onAnimatorDiagnostics?: (diagnostics: readonly CharacterRuntimeDiagnostic[]) => void;
};
