import { SceneHierarchyRoot } from "../../scene/components/SceneHierarchyRoot";
import { HierarchyPanel } from "../../hierarchy/components/HierarchyPanel";
import type { useSceneObjectCommands } from "../../scene/hooks/useSceneObjectCommands";
import type { SceneAssetIntegrationController } from "../../assets/application/useSceneAssetIntegration";
import type { CameraCoordinationController } from "../../camera/application/useCameraCoordination";
import type { PrefabEditorController } from "../../prefabs/application/usePrefabEditorSession";
import type { Material, SceneObject } from "../../types";

type HierarchyPaneProps = {
  sceneObjects: SceneObject[];
  sceneActiveObjectId: string;
  setSceneActiveCameraId: (id: string) => void;
  selectSceneObject: (id: string) => void;
  sceneCommands: ReturnType<typeof useSceneObjectCommands>;
  prefab: PrefabEditorController;
  cameras: CameraCoordinationController;
  assets: SceneAssetIntegrationController;
  materials: Material[];
  assignSceneMaterial: (objectId: string, materialId: string | null) => void;
};

export function HierarchyPane({
  sceneObjects,
  sceneActiveObjectId,
  setSceneActiveCameraId,
  selectSceneObject,
  sceneCommands,
  prefab,
  cameras,
  assets,
  materials,
  assignSceneMaterial,
}: HierarchyPaneProps) {
  const prefabModeActive = Boolean(prefab.state);
  return (
    <SceneHierarchyRoot prefab={prefabModeActive}><HierarchyPanel
      objects={prefabModeActive ? prefab.objects : sceneObjects}
      activeObjectId={prefabModeActive ? prefab.activeObjectId : sceneActiveObjectId}
      activeCameraId={cameras.editorActiveCameraId}
      viewThroughCameraId={cameras.editorViewThroughCameraId}
      setActiveObjectId={prefabModeActive ? prefab.selectObject : selectSceneObject}
      updateObject={prefabModeActive ? prefab.updateObject : sceneCommands.updateObject}
      moveObject={prefabModeActive ? prefab.moveObject : sceneCommands.moveObject}
      lookThroughCamera={prefabModeActive ? cameras.lookThroughPrefabCamera : cameras.lookThroughSceneCamera}
      alignCameraToView={prefabModeActive ? cameras.alignPrefabCameraToView : cameras.alignSceneCameraToView}
      setActiveCamera={prefabModeActive ? () => undefined : setSceneActiveCameraId}
      deleteObjects={prefabModeActive ? prefab.deleteObjects : sceneCommands.deleteObjects}
      duplicateObjects={prefabModeActive ? prefab.duplicateObjects : sceneCommands.duplicateObjects}
      createEmpty={prefabModeActive ? prefab.createEmpty : sceneCommands.addEmptyTransform}
      createEmptyParent={prefabModeActive ? prefab.createEmptyParent : sceneCommands.createEmptyParent}
      frameObject={prefabModeActive ? prefab.frameObject : sceneCommands.frameObject}
      materials={materials}
      assignMaterialToObject={prefabModeActive ? prefab.assignMaterial : assignSceneMaterial}
      addPrimitive={prefabModeActive ? prefab.addPrimitive : sceneCommands.addPrimitive}
      addCamera={prefabModeActive ? prefab.addCamera : sceneCommands.addCamera}
      addAssetToHierarchy={(asset) => prefabModeActive
        ? assets.addAssetToPrefab(asset, undefined, null, "prepend")
        : assets.addAssetToScene(asset, undefined, null, "prepend")}
      requireCamera={!prefabModeActive}
      lockedRootId={prefab.masterRootId}
    /></SceneHierarchyRoot>
  );
}
