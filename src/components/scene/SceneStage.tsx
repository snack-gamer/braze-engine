import { useState } from "react";
import { SceneViewToolbar } from "./SceneViewToolbar";
import { ThreeScene } from "../../ThreeScene";
import type {
  CameraState,
  ColliderComponent,
  DepthOfFieldComponent,
  EditorPrefs,
  EnvironmentSettings,
  ModifierPinSelection,
  Material,
  PhysicsWorldSettings,
  ScenePlaybackMode,
  SceneObject,
  TransformMode,
} from "../../types";
import type { ColliderEditSelection } from "../../physics/authoring/collider-edit";
import type { SceneRenderStatus } from "../../three/runtime";
import type { AnimationDocument } from "../../animation/types";
import type { AssetAnimationClipInfo } from "../../three/assets";
import type { PrimeTimelineSample } from "../../timeline/types";
import { groundPlacementFromViewport } from "../../lib/viewport-placement";
import type { ObjectTransformPatch } from "../../scene/authoring/live-transform";
import type { CharacterRuntimeDiagnostic } from "../../character/runtime/diagnostics";
import type { AnimatorPlaybackBinding } from "../../character/application/playback/animator-playback-binding";
import type { ImportedClipPreviewSubscription } from "../../animation/application/imported-clip-preview-channel";
import type { ViewportFrameRate } from "../../three/viewport-frame-rate";

type SceneStageProps = {
  transformMode: TransformMode;
  setTransformMode: (value: TransformMode) => void;
  objects: SceneObject[];
  materials: Material[];
  activeObjectId: string;
  setActiveObjectId: (value: string) => void;
  setCamera: (value: CameraState) => void;
  updateObjectTransform: (
    id: string,
    transform: ObjectTransformPatch,
  ) => void;
  previewObjectTransform: (id: string, transform: ObjectTransformPatch) => void;
  updateModifierPin: (objectId: string, modifierId: string, pinId: string, localOffset: [number, number, number]) => void;
  updatePhysicsObject: (id: string, patch: Partial<SceneObject>) => void;
  editingCollider: ColliderEditSelection | null;
  selectedModifierPin: ModifierPinSelection | null;
  selectModifierPin: (selection: ModifierPinSelection | null) => void;
  camera: CameraState;
  cameraPreviewAspect: number | null;
  activeCameraId: string;
  cameraNear: number;
  cameraFar: number;
  cameraDepthOfField: DepthOfFieldComponent | null;
  onAssetDrop: (
    payload: { url: string; name: string; filename: string; guid?: string },
    position?: [number, number, number],
  ) => void;
  onHdriDrop: (payload: { url: string; name: string; filename: string }) => void;
  environment: EnvironmentSettings;
  editorPrefs: EditorPrefs;
  onRenderStatusChange?: (status: SceneRenderStatus) => void;
  onViewportFrameRate?: (frameRate: ViewportFrameRate) => void;
  animationPreviewMode?: boolean;
  scenePlaybackMode: ScenePlaybackMode;
  physicsStepToken: number;
  physicsWorldSettings: PhysicsWorldSettings;
  animationDocument?: AnimationDocument;
  animationBaseObjects?: SceneObject[];
  subscribeTimelineFrame?: (listener: (sample: PrimeTimelineSample) => void) => () => void;
  onAssetAnimationsDiscovered?: (objectId: string, clips: AssetAnimationClipInfo[]) => void;
  onAnimatorPlaybackBindingChange?: (binding: AnimatorPlaybackBinding | null) => void;
  subscribeImportedClipPreview?: ImportedClipPreviewSubscription;
  onAnimatorDiagnostics?: (diagnostics: readonly CharacterRuntimeDiagnostic[]) => void;
};

export function SceneStage(props: SceneStageProps) {
  const {
    transformMode,
    setTransformMode,
    objects,
    materials,
    activeObjectId,
    setActiveObjectId,
    setCamera,
    updateObjectTransform,
    previewObjectTransform,
    updateModifierPin,
    updatePhysicsObject,
    editingCollider,
    selectedModifierPin,
    selectModifierPin,
    camera,
    cameraPreviewAspect,
    activeCameraId,
    cameraNear,
    cameraFar,
    cameraDepthOfField,
    onAssetDrop,
    onHdriDrop,
    environment,
    editorPrefs,
    onRenderStatusChange,
    onViewportFrameRate,
    animationPreviewMode = false,
    scenePlaybackMode,
    physicsStepToken,
    physicsWorldSettings,
    animationDocument,
    animationBaseObjects,
    subscribeTimelineFrame,
    onAssetAnimationsDiscovered,
    onAnimatorPlaybackBindingChange,
    subscribeImportedClipPreview,
    onAnimatorDiagnostics,
  } = props;
  const [focusSelectionToken, setFocusSelectionToken] = useState(0);

  const updateCollider = (objectId: string, colliderId: string, patch: Partial<ColliderComponent>) => {
    const object = objects.find((candidate) => candidate.id === objectId);
    if (!object) return;
    updatePhysicsObject(objectId, {
      colliders: (object.colliders ?? []).map((collider) => collider.id === colliderId ? { ...collider, ...patch } : collider),
    });
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    if (types.includes("application/x-tgan-asset") || types.includes("application/x-tgan-hdri")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    if (types.includes("application/x-tgan-hdri")) {
      const raw = event.dataTransfer.getData("application/x-tgan-hdri");
      if (!raw) return;
      event.preventDefault();
      try {
        const payload = JSON.parse(raw) as { url: string; name: string; filename: string };
        if (payload.url && payload.filename) onHdriDrop(payload);
      } catch {
        // ignore malformed drag payload
      }
      return;
    }
    const raw = event.dataTransfer.getData("application/x-tgan-asset");
    if (!raw) return;
    event.preventDefault();
    try {
      const payload = JSON.parse(raw) as { url: string; name: string; filename: string; guid?: string };
      if (payload.url && payload.filename) {
        const position = groundPlacementFromViewport({
          clientX: event.clientX,
          clientY: event.clientY,
          rect: event.currentTarget.getBoundingClientRect(),
          camera,
          near: cameraNear,
          far: cameraFar,
        });
        onAssetDrop(payload, position ?? undefined);
      }
    } catch {
      // ignore malformed drag payload
    }
  };

  return (
    <div
      className="stage-host scene-host"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <SceneViewToolbar
        transformMode={transformMode}
        disabled={animationPreviewMode}
        onTransformModeChange={setTransformMode}
        onFrameSelection={() => setFocusSelectionToken((token) => token + 1)}
      />

      <div className="scene-canvas active">
        <ThreeScene
          objects={objects}
          materials={materials}
          activeObjectId={activeObjectId}
          transformMode={transformMode}
          showTransformControls={editorPrefs.showGizmos && !animationPreviewMode}
          showEditorOverlays={editorPrefs.showGizmos && !animationPreviewMode}
          showObjectLabels={editorPrefs.showObjectLabels}
          showCameraGizmos={editorPrefs.showCameraGizmos}
          showGrid={editorPrefs.showGrid && !animationPreviewMode}
          transformSpace={editorPrefs.transformSpace}
          transformSnapping={editorPrefs.transformSnapping}
          translationSnap={editorPrefs.translationSnap}
          rotationSnapDegrees={editorPrefs.rotationSnapDegrees}
          scaleSnap={editorPrefs.scaleSnap}
          transformGizmoSize={editorPrefs.transformGizmoSize}
          focusSelectionToken={focusSelectionToken}
          animationPreviewMode={animationPreviewMode}
          scenePlaybackMode={scenePlaybackMode}
          physicsStepToken={physicsStepToken}
          physicsWorldSettings={physicsWorldSettings}
          editingCollider={editingCollider}
          environment={environment}
          activeCameraId={activeCameraId}
          cameraPreviewAspect={cameraPreviewAspect}
          cameraTransform={camera}
          cameraNear={cameraNear}
          cameraFar={cameraFar}
          cameraDepthOfField={cameraDepthOfField}
          gridOpacity={editorPrefs.gridOpacity}
          gridColor={editorPrefs.gridColor}
          gridHorizon={editorPrefs.gridHorizon}
          onSelectObject={setActiveObjectId}
          onCameraChange={setCamera}
          onTransformObject={updateObjectTransform}
          onPreviewTransformObject={previewObjectTransform}
          onUpdateModifierPin={updateModifierPin}
          onUpdateCollider={updateCollider}
          selectedModifierPin={selectedModifierPin}
          onSelectModifierPin={selectModifierPin}
          onRenderStatusChange={onRenderStatusChange}
          onViewportFrameRate={onViewportFrameRate}
          animationDocument={animationDocument}
          animationBaseObjects={animationBaseObjects}
          subscribeTimelineFrame={subscribeTimelineFrame}
          onAssetAnimationsDiscovered={onAssetAnimationsDiscovered}
          onAnimatorPlaybackBindingChange={onAnimatorPlaybackBindingChange}
          subscribeImportedClipPreview={subscribeImportedClipPreview}
          onAnimatorDiagnostics={onAnimatorDiagnostics}
        />
      </div>
    </div>
  );
}
