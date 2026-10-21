import { AssetBrowser } from "../../components/AssetBrowser/AssetBrowser";
import { usePublishCharacterImportedAssets } from "../../character/application/CharacterAssetLibraryProvider";
import { useProjectCharacterAssets } from "../../character/application/useProjectCharacterAssets";
import type { CharacterAssetEditorSelection } from "../../character/components/CharacterAssetEditorDialog";
import type { useAssetLibrary } from "../../hooks/useAssetLibrary";
import type { useHdriLibrary } from "../../hooks/useHdriLibrary";
import type { useMaterials } from "../../hooks/useMaterials";
import type { SceneAssetIntegrationController } from "../../assets/application/useSceneAssetIntegration";
import type { PrefabEditorController } from "../../prefabs/application/usePrefabEditorSession";
import type { EditorSelectionController } from "../selection/useEditorSelection";
import type { EnvironmentSettings, SceneObject } from "../../types";
import { lazy, Suspense, useState, type Dispatch, type SetStateAction } from "react";
import { useProjectAssetStatus } from "../status-bar/useProjectAssetStatus";

const ProjectInputSettingsDialog = lazy(() => import("../../input/components/ProjectInputSettingsDialog"));
const CharacterAssetEditorDialog = lazy(() => import(
  "../../character/components/CharacterAssetEditorDialog"
));

type ProjectPaneProps = {
  assets: ReturnType<typeof useAssetLibrary>;
  assetIntegration: SceneAssetIntegrationController;
  hdris: ReturnType<typeof useHdriLibrary>;
  materials: ReturnType<typeof useMaterials>;
  selection: EditorSelectionController;
  prefab: PrefabEditorController;
  activeObject: SceneObject | null;
  assignSceneMaterial: (objectId: string, materialId: string | null) => void;
  environment: EnvironmentSettings;
  setEnvironment: Dispatch<SetStateAction<EnvironmentSettings>>;
};

export function ProjectPane({
  assets,
  assetIntegration,
  hdris,
  materials,
  selection,
  prefab,
  activeObject,
  assignSceneMaterial,
  environment,
  setEnvironment,
}: ProjectPaneProps) {
  useProjectAssetStatus(assets);
  usePublishCharacterImportedAssets(assets.assets, assets.ready);
  const characterAssets = useProjectCharacterAssets();
  const [openCharacterAsset, setOpenCharacterAsset] = useState<CharacterAssetEditorSelection | null>(null);
  const [inputSettingsOpen, setInputSettingsOpen] = useState(false);
  const prefabModeActive = Boolean(prefab.state);
  return (
    <>
      <AssetBrowser
        materials={materials.materials}
        characterAssets={characterAssets}
        openAvatarMask={(id) => setOpenCharacterAsset({ id })}
        openProjectInput={() => setInputSettingsOpen(true)}
        focusedMaterialId={selection.focusedMaterialId}
        setFocusedMaterialId={selection.setFocusedMaterialId}
        createMaterial={materials.create}
        updateMaterial={materials.update}
        duplicateMaterial={materials.duplicate}
        removeMaterial={materials.remove}
        activeObject={activeObject ?? undefined}
        objects={assetIntegration.browserObjects}
        assignMaterialToObject={prefabModeActive ? prefab.assignMaterial : assignSceneMaterial}
        models={assetIntegration.models}
        images={assetIntegration.images}
        prefabs={assetIntegration.prefabs}
        inputActionMaps={assetIntegration.inputActionMaps}
        removeInputActionMap={assetIntegration.removeInputActionMap}
        addModelToScene={(asset) => prefabModeActive
          ? assetIntegration.addAssetToPrefab(asset)
          : assetIntegration.addAssetToScene(asset)}
        addImageToScene={(asset) => prefabModeActive
          ? assetIntegration.addAssetToPrefab(asset)
          : assetIntegration.addAssetToScene(asset)}
        addPrefabToScene={(asset) => prefabModeActive
          ? assetIntegration.addAssetToPrefab(asset)
          : assetIntegration.addPrefabToScene(asset)}
        removeModel={assetIntegration.removeModel}
        removeImage={assetIntegration.removeImage}
        removePrefab={assetIntegration.removePrefab}
        duplicateModel={assets.duplicate}
        duplicateImage={assets.duplicate}
        duplicatePrefab={assets.duplicate}
        revealModel={(filename) => void assets.reveal(filename)}
        revealImage={(filename) => void assets.reveal(filename)}
        revealPrefab={(filename) => void assets.reveal(filename)}
        refreshAssets={() => void assets.refresh()}
        savePrefabFromObjects={prefabModeActive
          ? assetIntegration.saveEditedPrefab
          : assetIntegration.saveScenePrefab}
        importAssetFiles={assetIntegration.importFiles}
        hdris={hdris.hdris}
        activeHdriUrl={environment.hdriUrl ?? undefined}
        applyHdri={(asset) => setEnvironment((current) => ({
          ...current,
          hdriUrl: asset.url,
          hdriName: asset.name,
        }))}
        removeHdri={(filename) => void hdris.remove(filename)}
        duplicateHdri={hdris.duplicate}
        revealHdri={(filename) => void hdris.reveal(filename)}
        refreshHdris={() => void hdris.refresh()}
        uploadHdri={hdris.upload}
        onAssetFocus={selection.focusAsset}
        onPrefabDisplayNameChange={assetIntegration.renamePrefabReferences}
        prefabModeActive={prefabModeActive}
      />
      {inputSettingsOpen && <Suspense fallback={null}>
        <ProjectInputSettingsDialog assets={assets.assets} onClose={() => setInputSettingsOpen(false)} />
      </Suspense>}
      {openCharacterAsset && (
        <Suspense fallback={null}>
          <CharacterAssetEditorDialog
            selection={openCharacterAsset}
            onClose={() => setOpenCharacterAsset(null)}
          />
        </Suspense>
      )}
    </>
  );
}
