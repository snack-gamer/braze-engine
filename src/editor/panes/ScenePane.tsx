import type { SceneAnimationController } from "../../animation/hooks/useSceneAnimation";
import type { SceneAssetIntegrationController } from "../../assets/application/useSceneAssetIntegration";
import type { CameraCoordinationController } from "../../camera/application/useCameraCoordination";
import { GizmosMenu } from "../../components/scene/GizmosMenu";
import { SceneStage } from "../../components/scene/SceneStage";
import { SceneViewSettingsToolbar } from "../../components/scene/SceneViewToolbar";
import type { useEditorPrefs } from "../../hooks/useEditorPrefs";
import type { PhysicsWorldController } from "../../physics/application/use-physics-world-controller";
import type { PrefabEditorController } from "../../prefabs/application/usePrefabEditorSession";
import type { createLiveTransformChannel } from "../../scene/authoring/live-transform";
import type { useSceneObjectCommands } from "../../scene/hooks/useSceneObjectCommands";
import type { PrimeTimelineController } from "../../timeline/usePrimeTimeline";
import type { EnvironmentSettings, Material, SceneObject, TransformMode } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";
import type { EditorSelectionController } from "../selection/useEditorSelection";
import type { ScenePlaySessionController } from "../session/useScenePlaySaveSession";
import { useAnimatorDiagnosticReporter } from "../playback/AnimatorDiagnosticProvider";
import { useSceneEditorStatus } from "../status-bar/useSceneEditorStatus";
import type { Dispatch, SetStateAction } from "react";
import type { AnimatorPlaybackBinding } from "../../character/application/playback/animator-playback-binding";
import type { ImportedClipPreviewSubscription } from "../../animation/application/imported-clip-preview-channel";

const EDITOR_CAMERA_NEAR = 0.05;
const EDITOR_CAMERA_FAR = 1000;
const PREFAB_MODE_BUTTON_CLASS = "ghost-button compact accent";

type ScenePaneSharedProps = {
  transformMode: TransformMode;
  setTransformMode: (mode: TransformMode) => void;
  prefs: ReturnType<typeof useEditorPrefs>;
  selection: EditorSelectionController;
  playback: ScenePlaySessionController;
};

type ScenePaneToolbarProps = Omit<ScenePaneSharedProps, "setTransformMode">;

export function ScenePaneToolbar({
  transformMode,
  prefs,
  selection,
  playback,
}: ScenePaneToolbarProps) {
  return (
    <SceneViewSettingsToolbar
      transformMode={transformMode}
      transformSpace={prefs.prefs.transformSpace}
      transformSnapping={prefs.prefs.transformSnapping}
      translationSnap={prefs.prefs.translationSnap}
      rotationSnapDegrees={prefs.prefs.rotationSnapDegrees}
      scaleSnap={prefs.prefs.scaleSnap}
      disabled={playback.mode !== "edit"}
      forceLocalSpace={Boolean(selection.editingCollider || selection.selectedModifierPin)}
      onPrefsChange={prefs.updatePrefs}
      trailingControls={(
        <GizmosMenu
          showGrid={prefs.prefs.showGrid}
          showGizmos={prefs.prefs.showGizmos}
          showObjectLabels={prefs.prefs.showObjectLabels}
          showCameraGizmos={prefs.prefs.showCameraGizmos}
          transformGizmoSize={prefs.prefs.transformGizmoSize}
          gridOpacity={prefs.prefs.gridOpacity}
          gridColor={prefs.prefs.gridColor}
          gridHorizon={prefs.prefs.gridHorizon}
          onChange={prefs.updatePrefs}
        />
      )}
    />
  );
}

type ScenePaneProps = ScenePaneSharedProps & {
  active: boolean;
  loaded: boolean;
  stageObjects: SceneObject[];
  sceneObjects: SceneObject[];
  materials: Material[];
  sceneActiveObjectId: string;
  selectSceneObject: (id: string) => void;
  sceneCommands: ReturnType<typeof useSceneObjectCommands>;
  prefab: PrefabEditorController;
  cameras: CameraCoordinationController;
  camera: Parameters<CameraCoordinationController["handleEditorCameraChange"]>[0];
  cameraPreviewAspect: number | null;
  liveTransforms: ReturnType<typeof createLiveTransformChannel>;
  assets: SceneAssetIntegrationController;
  environment: EnvironmentSettings;
  setEnvironment: Dispatch<SetStateAction<EnvironmentSettings>>;
  physics: PhysicsWorldController;
  animation: SceneAnimationController;
  timeline: PrimeTimelineController;
  onAnimatorPlaybackBindingChange?: (binding: AnimatorPlaybackBinding | null) => void;
  subscribeImportedClipPreview?: ImportedClipPreviewSubscription;
};

export function ScenePane({
  active,
  loaded,
  transformMode,
  setTransformMode,
  prefs,
  selection,
  playback,
  stageObjects,
  sceneObjects,
  materials,
  sceneActiveObjectId,
  selectSceneObject,
  sceneCommands,
  prefab,
  cameras,
  camera,
  cameraPreviewAspect,
  liveTransforms,
  assets,
  environment,
  setEnvironment,
  physics,
  animation,
  timeline,
  onAnimatorPlaybackBindingChange,
  subscribeImportedClipPreview,
}: ScenePaneProps) {
  const prefabModeActive = Boolean(prefab.state);
  const activeObjectId = prefabModeActive ? prefab.activeObjectId : sceneActiveObjectId;
  const reportAnimatorDiagnostics = useAnimatorDiagnosticReporter();
  const reportViewportFrameRate = useSceneEditorStatus({
    active,
    camera,
    selection,
    activeObject: prefabModeActive
      ? prefab.activeObject
      : sceneObjects.find((object) => object.id === sceneActiveObjectId) ?? null,
    prefabName: prefab.state?.doc.name,
  });
  return (
    <section className="stage" aria-label="scene stage">
      {prefab.state && (
        <div className="prefab-mode-toolbar" role="status" aria-label="Prefab edit mode">
          <span className="prefab-mode-toolbar__title">
            <EditorIcon name="prefabMode" size="control" />
            <strong>Prefab Mode</strong>
          </span>
          <span className="prefab-mode-toolbar__name">{prefab.state.doc.name}</span>
          {prefab.state.error && <span className="prefab-mode-toolbar__error">{prefab.state.error}</span>}
          <button
            type="button"
            className={PREFAB_MODE_BUTTON_CLASS}
            onClick={prefab.save}
            disabled={!prefab.state.dirty || prefab.state.saving}
          >
            <EditorIcon name="save" size="control" />{
              prefab.state.saving ? "Saving" : prefab.state.dirty ? "Save" : "Saved"
            }
          </button>
          <button type="button" className={PREFAB_MODE_BUTTON_CLASS} onClick={prefab.close}>
            <EditorIcon name="close" size="control" /> Close
          </button>
        </div>
      )}
      <div className="stage-pane active">
        {loaded && active ? (
          <SceneStage
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            objects={stageObjects}
            materials={materials}
            activeObjectId={activeObjectId}
            setActiveObjectId={prefabModeActive ? prefab.selectObject : selectSceneObject}
            setCamera={cameras.handleEditorCameraChange}
            updateObjectTransform={prefabModeActive
              ? prefab.updateObjectTransform
              : sceneCommands.updateAnimatedObjectTransform}
            previewObjectTransform={liveTransforms.publish}
            updateModifierPin={prefabModeActive ? prefab.updateModifierPin : sceneCommands.updateModifierPin}
            updatePhysicsObject={prefabModeActive ? prefab.updateObject : sceneCommands.updateObject}
            editingCollider={selection.editingCollider}
            selectedModifierPin={selection.selectedModifierPin}
            selectModifierPin={selection.setSelectedModifierPin}
            camera={camera}
            cameraPreviewAspect={cameraPreviewAspect}
            activeCameraId={cameras.editorActiveCameraId}
            cameraNear={EDITOR_CAMERA_NEAR}
            cameraFar={EDITOR_CAMERA_FAR}
            cameraDepthOfField={cameras.editorDepthOfField}
            onAssetDrop={(payload, position) => prefabModeActive
              ? assets.addAssetToPrefab(payload, position, null)
              : assets.addAssetToScene(payload, position, null)}
            onHdriDrop={(payload) => setEnvironment((current) => ({
              ...current,
              hdriUrl: payload.url,
              hdriName: payload.name,
            }))}
            environment={environment}
            editorPrefs={prefs.prefs}
            animationPreviewMode={playback.mode !== "edit"}
            scenePlaybackMode={playback.mode}
            physicsStepToken={playback.physicsStepToken}
            physicsWorldSettings={physics.settings}
            animationDocument={!prefabModeActive ? animation.document : undefined}
            animationBaseObjects={!prefabModeActive ? sceneObjects : undefined}
            subscribeTimelineFrame={!prefabModeActive ? timeline.subscribeFrame : undefined}
            onAssetAnimationsDiscovered={!prefabModeActive ? animation.registerMotionClips : undefined}
            onAnimatorPlaybackBindingChange={onAnimatorPlaybackBindingChange}
            subscribeImportedClipPreview={subscribeImportedClipPreview}
            onAnimatorDiagnostics={reportAnimatorDiagnostics}
            onViewportFrameRate={reportViewportFrameRate}
          />
        ) : !loaded ? (
          <div className="scene-loading" role="status">Loading scene</div>
        ) : null}
      </div>
    </section>
  );
}
