import { useCallback, useEffect } from "react";
import type { HistoryUpdater } from "../../history/history-state";
import { isAvatarBotObject } from "../../lib/bots";
import { applyScenePatch } from "../../lib/prefab-authoring";
import { repairImportedMaterialBindings } from "../../assets/import-support";
import type { Material, SceneObject } from "../../types";

type SetSceneObjects = (updater: HistoryUpdater<SceneObject[]>) => void;

type SceneMaterialIntegrationInput = {
  materials: Material[];
  setSceneObjects: SetSceneObjects;
  prefabModeActive: boolean;
  mutatePrefabObjects: (updater: (objects: SceneObject[]) => SceneObject[]) => void;
};

function removeMissingMaterialReferences(objects: SceneObject[], knownIds: Set<string>): SceneObject[] {
  let changed = false;
  const next = objects.map((object) => {
    const bindings = object.importedMaterialBindings?.filter((binding) => knownIds.has(binding.materialId));
    const bindingsChanged = bindings?.length !== object.importedMaterialBindings?.length;
    if ((!object.materialId || knownIds.has(object.materialId)) && !bindingsChanged) return object;
    changed = true;
    return {
      ...object,
      materialId: object.materialId && !knownIds.has(object.materialId) ? undefined : object.materialId,
      importedMaterialBindings: bindings && bindings.length > 0 ? bindings : undefined,
    };
  });
  return changed ? next : objects;
}

function repairImportedBindings(objects: SceneObject[], materials: Material[]): SceneObject[] {
  let changed = false;
  const next = objects.map((object) => {
    const repaired = repairImportedMaterialBindings(object, materials);
    if (repaired !== object) changed = true;
    return repaired;
  });
  return changed ? next : objects;
}

/** Maintains authored material references for scene and active prefab documents. */
export function useSceneMaterialIntegration({
  materials,
  setSceneObjects,
  prefabModeActive,
  mutatePrefabObjects,
}: SceneMaterialIntegrationInput) {
  const assignSceneMaterial = useCallback((objectId: string, materialId: string | null) => {
    setSceneObjects((objects) => objects.map((object) => (
      object.id === objectId
      && object.primitive !== "camera"
      && (!materialId || !isAvatarBotObject(object))
        ? applyScenePatch(object, { materialId: materialId ?? undefined })
        : object
    )));
  }, [setSceneObjects]);

  useEffect(() => {
    const knownIds = new Set(materials.map((material) => material.id));
    setSceneObjects((objects) => removeMissingMaterialReferences(objects, knownIds));
  }, [materials, setSceneObjects]);

  useEffect(() => {
    if (materials.length === 0) return;
    const repair = (objects: SceneObject[]) => repairImportedBindings(objects, materials);
    setSceneObjects(repair);
    if (prefabModeActive) mutatePrefabObjects(repair);
  }, [materials, mutatePrefabObjects, prefabModeActive, setSceneObjects]);

  return { assignSceneMaterial };
}
