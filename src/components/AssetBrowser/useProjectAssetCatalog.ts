import { useMemo } from "react";
import { useSceneWorkspaceState } from "../../scene/components/SceneWorkspaceContext";
import { defaultSceneName } from "../../scene/domain/scene-identity";
import { buildAssetCatalog, type BuildAssetCatalogInput } from "./asset-catalog";

/** Adds saved scene documents to the same searchable Project catalog as other assets. */
export function useProjectAssetCatalog(input: Omit<BuildAssetCatalogInput, "scenes">) {
  const { snapshot, activeScene } = useSceneWorkspaceState();
  const scenes = useMemo(() => snapshot?.scenes.map((scene) => ({
    id: scene.id,
    name: scene.id === activeScene?.sceneId ? snapshot.editor.name : scene.name ?? defaultSceneName(scene.id),
    active: scene.id === activeScene?.sceneId,
    objectCount: scene.objectCount ?? null,
  })) ?? [], [snapshot?.scenes, activeScene?.sceneId, snapshot?.editor.name]);
  const { path, search, filter, subfolders, materials, avatarMasks, models, images,
    prefabs, hdris, inputActionMaps, fonts, favoriteKeys, recentKeys, expandedModelFilenames, folders } = input;
  return useMemo(() => buildAssetCatalog({ path, search, filter, subfolders, materials,
    avatarMasks, models, images, prefabs, hdris, inputActionMaps, fonts, favoriteKeys, recentKeys,
    expandedModelFilenames, folders, scenes }), [path, search, filter, subfolders, materials,
    avatarMasks, models, images, prefabs, hdris, inputActionMaps, fonts, favoriteKeys, recentKeys,
    expandedModelFilenames, folders, scenes]);
}
