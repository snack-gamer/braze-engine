import { SelectedObjectAnimationProjection } from "../../animation/components/SelectedObjectAnimationProjection";
import { AnimationClipEventInspector } from "../../animation/components/AnimationClipEventInspector";
import type { SceneAnimationController } from "../../animation/hooks/useSceneAnimation";
import type { AnimatorWorkspaceTarget } from "../../character/application/useAnimatorWorkspaceSession";
import { IMAGE_ASSET_RE } from "../../assets/import-support";
import type { SceneAssetIntegrationController } from "../../assets/application/useSceneAssetIntegration";
import type { CameraCoordinationController } from "../../camera/application/useCameraCoordination";
import { ResizableInspectorRail } from "../../components/ResizableInspectorRail";
import { CameraInspector } from "../../components/scene/CameraInspector";
import {
  SceneInspector,
  type AnimatedTransformChannels,
} from "../../components/scene/SceneInspector";
import {
  DeferredAssetInspector,
  DeferredMaterialEditor,
  DeferredPhysicsSettingsPanel,
  DeferredRenderSettingsPanel,
} from "../../docking/DeferredPaneContent";
import { HistoryTransactionProvider } from "../../history/HistoryTransactionContext";
import type { useAssetLibrary } from "../../hooks/useAssetLibrary";
import type { useHdriLibrary } from "../../hooks/useHdriLibrary";
import type { useMaterials } from "../../hooks/useMaterials";
import type { PhysicsWorldController } from "../../physics/application/use-physics-world-controller";
import type { PrefabEditorController } from "../../prefabs/application/usePrefabEditorSession";
import type { useSceneObjectCommands } from "../../scene/hooks/useSceneObjectCommands";
import type { EnvironmentSettings, SceneObject } from "../../types";
import type { EditorSelectionController } from "../selection/useEditorSelection";
import type { Dispatch, SetStateAction } from "react";

type InspectorPaneProps = {
  active: boolean;
  sceneObjects: SceneObject[];
  activeSceneObject: SceneObject | null;
  activeCameraId: string;
  setActiveCameraId: (id: string) => void;
  sceneCommands: ReturnType<typeof useSceneObjectCommands>;
  selection: EditorSelectionController;
  prefab: PrefabEditorController;
  cameras: CameraCoordinationController;
  assets: ReturnType<typeof useAssetLibrary>;
  assetIntegration: SceneAssetIntegrationController;
  hdris: ReturnType<typeof useHdriLibrary>;
  materials: ReturnType<typeof useMaterials>;
  environment: EnvironmentSettings;
  setEnvironment: Dispatch<SetStateAction<EnvironmentSettings>>;
  physics: PhysicsWorldController;
  animation: SceneAnimationController;
  beginHistoryTransaction: () => void;
  endHistoryTransaction: () => void;
  openAnimatorWorkspace: (target: AnimatorWorkspaceTarget) => void;
};

function ObjectInspector({
  object,
  objects,
  activeCameraId,
  setActiveCameraId,
  lookThroughCamera,
  updateObject,
  materials,
  imageAssets,
  selection,
  animatedTransformChannels,
  onOpenAnimatorController,
}: {
  object: SceneObject;
  objects: SceneObject[];
  activeCameraId: string;
  setActiveCameraId: (id: string) => void;
  lookThroughCamera: (id: string) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  materials: ReturnType<typeof useMaterials>["materials"];
  imageAssets: ReturnType<typeof useAssetLibrary>["assets"];
  selection: EditorSelectionController;
  animatedTransformChannels?: AnimatedTransformChannels;
  onOpenAnimatorController: () => void;
}) {
  return object.primitive === "camera" ? (
    <CameraInspector
      cameraObject={object}
      objects={objects}
      animatedTransformChannels={animatedTransformChannels}
      isActive={object.id === activeCameraId}
      setActiveCamera={setActiveCameraId}
      lookThroughCamera={lookThroughCamera}
      updateObject={updateObject}
    />
  ) : (
    <SceneInspector
      activeObject={object}
      objects={objects}
      animatedTransformChannels={animatedTransformChannels}
      updateObject={updateObject}
      materialLibrary={materials}
      imageAssets={imageAssets}
      editingCollider={selection.editingCollider}
      onEditCollider={selection.setEditingCollider}
      selectedModifierPin={selection.selectedModifierPin}
      selectModifierPin={selection.setSelectedModifierPin}
      onOpenAnimatorController={onOpenAnimatorController}
    />
  );
}

export function InspectorPane({
  active,
  sceneObjects,
  activeSceneObject,
  activeCameraId,
  setActiveCameraId,
  sceneCommands,
  selection,
  prefab,
  cameras,
  assets,
  assetIntegration,
  hdris,
  materials,
  environment,
  setEnvironment,
  physics,
  animation,
  beginHistoryTransaction,
  endHistoryTransaction,
  openAnimatorWorkspace,
}: InspectorPaneProps) {
  const prefabModeActive = Boolean(prefab.state);
  const imageAssets = assetIntegration.images;
  if (selection.inspectorTarget === "animation-event" && selection.animationClipEvent) {
    return <ResizableInspectorRail>
      <AnimationClipEventInspector binding={selection.animationClipEvent} />
    </ResizableInspectorRail>;
  }
  return (
    <ResizableInspectorRail>
      {selection.inspectorTarget === "physics" && (
        <DeferredPhysicsSettingsPanel worldSettings={physics.settings} updateWorldSettings={physics.update} />
      )}
      {selection.inspectorTarget === "environment" && (
        <div className="rail-scroll">
          <DeferredRenderSettingsPanel
            environment={environment}
            setEnvironment={setEnvironment}
            hdris={hdris.hdris}
            uploadHdri={hdris.upload}
            removeHdri={hdris.remove}
          />
        </div>
      )}
      {selection.inspectorTarget === "object" && prefabModeActive && prefab.activeObject && (
        <ObjectInspector
          object={prefab.activeObject}
          objects={prefab.objects}
          activeCameraId=""
          setActiveCameraId={() => undefined}
          lookThroughCamera={cameras.lookThroughPrefabCamera}
          updateObject={prefab.updateObject}
          materials={materials.materials}
          imageAssets={imageAssets}
          selection={selection}
          onOpenAnimatorController={() => {
            const prefabAssetFilename = prefab.state?.asset.filename;
            if (!prefabAssetFilename) return;
            openAnimatorWorkspace({
              scope: "prefab",
              objectId: prefab.activeObject!.id,
              prefabAssetFilename,
            });
          }}
        />
      )}
      {selection.inspectorTarget === "object" && !prefabModeActive && selection.selectedMaterial && (
        <DeferredMaterialEditor
          material={selection.selectedMaterial}
          imageAssets={assets.assets.filter((asset) => asset.kind === "image" || IMAGE_ASSET_RE.test(asset.filename))}
          update={(patch) => materials.update(selection.selectedMaterial!.id, patch)}
          remove={() => {
            materials.remove(selection.selectedMaterial!.id);
            selection.setFocusedMaterialId(null);
          }}
        />
      )}
      {selection.inspectorTarget === "object" && !prefabModeActive && !selection.selectedMaterial && selection.focusedAsset && (
        <DeferredAssetInspector
          focused={selection.focusedAsset}
          modelAssets={assetIntegration.models}
          projectAssets={assets.assets}
          usageCount={assetIntegration.focusedUsage}
          onReveal={(asset, kind) => kind === "hdri" ? void hdris.reveal(asset.filename) : void assets.reveal(asset.filename)}
          onRefresh={(kind) => kind === "hdri" ? void hdris.refresh() : void assets.refresh()}
          onDelete={(asset, kind) => {
            if (kind === "hdri") void hdris.remove(asset.filename);
            else if (kind === "model" || kind === "font") assetIntegration.removeModel(asset.filename);
            else if (kind === "image") assetIntegration.removeImage(asset.filename);
            else if (kind === "prefab") assetIntegration.removePrefab(asset.filename);
            else if (kind === "inputActionMap") assetIntegration.removeInputActionMap(asset.filename);
            selection.setFocusedAsset(null);
          }}
          onEditPrefab={(asset) => void prefab.open(asset)}
          onModelImportSaved={assetIntegration.modelImportSaved}
        />
      )}
      {selection.inspectorTarget === "object"
        && !prefabModeActive
        && !selection.selectedMaterial
        && !selection.focusedAsset
        && activeSceneObject && (
          <HistoryTransactionProvider beginTransaction={beginHistoryTransaction} endTransaction={endHistoryTransaction}>
            <SelectedObjectAnimationProjection
              objects={sceneObjects}
              activeObjectId={activeSceneObject.id}
              animationDocument={animation.document}
              playback={animation.playback}
              active={active}
            >
              {({ activeObject, objects, animatedTransformChannels }) => (
                <ObjectInspector
                  object={activeObject}
                  objects={objects}
                  activeCameraId={activeCameraId}
                  setActiveCameraId={setActiveCameraId}
                  lookThroughCamera={cameras.lookThroughSceneCamera}
                  updateObject={sceneCommands.updateObject}
                  materials={materials.materials}
                  imageAssets={imageAssets}
                  selection={selection}
                  animatedTransformChannels={animatedTransformChannels}
                  onOpenAnimatorController={() => openAnimatorWorkspace({
                    scope: "scene",
                    objectId: activeObject.id,
                  })}
                />
              )}
            </SelectedObjectAnimationProjection>
          </HistoryTransactionProvider>
        )}
    </ResizableInspectorRail>
  );
}
