import { countUiAssetReferences } from "../../game-ui/application/ui-asset-references";
import { useCallback, useEffect, useMemo } from "react";
import type { FocusedLibraryAsset } from "../../components/AssetBrowser/AssetBrowser";
import type { HistoryUpdater } from "../../history/history-state";
import type { useAssetLibrary } from "../../hooks/useAssetLibrary";
import type { LibraryAsset } from "../../lib/api";
import { savePrefabAsset } from "../../lib/api";
import { versionedModelAssetUrl } from "../../lib/model-import-settings";
import {
  createPrefabDocument,
  fetchPrefabDocument,
  instantiatePrefabDocument,
} from "../../lib/prefabs";
import type { Material, SceneObject, Vec3 } from "../../types";
import type { PrefabEditorController } from "../../prefabs/application/usePrefabEditorSession";
import { encodePrefabDocument } from "../../prefabs/serialization/prefab-document";
import { importAssetFiles } from "../import-pipeline";
import {
  assetFilenameFromUrl,
  assetFilenameMatchesDeleted,
  isImageAsset,
  isModelAsset,
  isPrefabAsset,
} from "../import-support";
import { createLibraryAssetSceneObject } from "./create-library-asset-scene-object";
import {
  reconcileSceneAssetReferences,
  resolveAssetForSceneInsertion,
} from "./scene-asset-resolution";

type SetSceneObjects = (updater: HistoryUpdater<SceneObject[]>) => void;
type AssetLibraryController = ReturnType<typeof useAssetLibrary>;
type Placement = "append" | "prepend";
type SceneAsset = Pick<LibraryAsset, "url" | "name" | "filename"> & { guid?: string };

type SceneAssetIntegrationInput = {
  assetLibrary: AssetLibraryController;
  materials: Material[];
  createMaterials: (patches: Array<Partial<Material> & { name?: string }>) => Material[];
  sceneObjects: SceneObject[];
  setSceneObjects: SetSceneObjects;
  activeTransformParentId?: string;
  selectSceneObject: (id: string) => void;
  focusedAsset: FocusedLibraryAsset;
  setFocusedAsset: (asset: FocusedLibraryAsset) => void;
  activeHdriUrl?: string;
  prefab: Pick<
    PrefabEditorController,
    "state" | "objects" | "mutateObjects" | "resolveParentId" | "insertObject" | "insertObjectsForSession"
  >;
};

/** Integrates project assets with authored scene and prefab documents. */
export function useSceneAssetIntegration(input: SceneAssetIntegrationInput) {
  const {
    assetLibrary,
    materials,
    createMaterials,
    sceneObjects,
    setSceneObjects,
    activeTransformParentId,
    selectSceneObject,
    focusedAsset,
    setFocusedAsset,
    activeHdriUrl,
    prefab,
  } = input;
  const prefabModeActive = Boolean(prefab.state);
  const prefabSessionKey = prefab.state?.asset.filename, mutatePrefabObjects = prefab.mutateObjects;
  const models = useMemo(
    () => assetLibrary.assets.filter(isModelAsset),
    [assetLibrary.assets],
  );
  const images = useMemo(() => assetLibrary.assets.filter(isImageAsset), [assetLibrary.assets]);
  const prefabs = useMemo(() => assetLibrary.assets.filter(isPrefabAsset), [assetLibrary.assets]);
  const inputActionMaps = useMemo(() => assetLibrary.assets.filter((asset) => asset.kind === "inputActionMap"), [assetLibrary.assets]);
  const browserObjects = useMemo(
    () => prefabModeActive ? [...sceneObjects, ...prefab.objects] : sceneObjects,
    [prefab.objects, prefabModeActive, sceneObjects],
  );
  const focusedUsage = useMemo(() => {
    if (!focusedAsset) return 0;
    if (focusedAsset.kind === "hdri") return activeHdriUrl?.endsWith(`/${focusedAsset.asset.filename}`) ? 1 : 0;
    if (focusedAsset.kind === "prefab") {
      return sceneObjects.filter((object) => object.prefabLink?.prefabFilename === focusedAsset.asset.filename).length;
    }
    return countUiAssetReferences(sceneObjects, new Set([focusedAsset.asset.guid?.toLowerCase() ?? ""])) + sceneObjects.filter((object) => assetFilenameFromUrl(object.assetUrl) === focusedAsset.asset.filename).length;
  }, [activeHdriUrl, focusedAsset, sceneObjects]);

  const savePrefabFromObjects = useCallback(async (
    sourceObjects: SceneObject[],
    ids: string[],
  ): Promise<LibraryAsset | null> => {
    const first = sourceObjects.find((object) => object.id === ids[0]);
    const name = first?.name || "Prefab";
    const document = createPrefabDocument(sourceObjects, ids, name);
    if (!document) return null;
    try {
      const asset = await savePrefabAsset(name, encodePrefabDocument(document));
      await assetLibrary.refresh();
      return asset;
    } catch (error) {
      console.error("prefab save failed", error);
      return null;
    }
  }, [assetLibrary]);
  const saveScenePrefab = useCallback(
    (ids: string[]) => savePrefabFromObjects(sceneObjects, ids),
    [savePrefabFromObjects, sceneObjects],
  );
  const saveEditedPrefab = useCallback(
    (ids: string[]) => savePrefabFromObjects(prefab.objects, ids),
    [prefab.objects, savePrefabFromObjects],
  );

  const addPrefabToScene = useCallback((
    asset: LibraryAsset,
    position?: Vec3,
    parentId: string | null | undefined = undefined,
    placement: Placement = "append",
  ) => {
    const resolvedParentId = parentId === undefined ? activeTransformParentId : parentId ?? undefined;
    void (async () => {
      try {
        const instances = instantiatePrefabDocument(await fetchPrefabDocument(asset), {
          parentId: resolvedParentId,
          position,
          asset,
        });
        if (instances.length === 0) return;
        setSceneObjects((items) => placement === "prepend" ? [...instances, ...items] : [...items, ...instances]);
        selectSceneObject(instances[0].id);
      } catch (error) {
        console.error("prefab instantiate failed", error);
      }
    })();
  }, [activeTransformParentId, selectSceneObject, setSceneObjects]);

  const addAssetToScene = useCallback((
    asset: SceneAsset,
    position?: Vec3,
    parentId: string | null | undefined = undefined,
    placement: Placement = "append",
  ) => {
    const resolvedAsset = resolveAssetForSceneInsertion(asset, assetLibrary.assets);
    if (isPrefabAsset(resolvedAsset)) {
      addPrefabToScene({ ...resolvedAsset, kind: "prefab", path: "", sizeBytes: 0 }, position, parentId, placement);
      return;
    }
    if (!isImageAsset(resolvedAsset) && !isModelAsset(resolvedAsset)) return;
    const resolvedParentId = parentId === undefined ? activeTransformParentId : parentId ?? undefined;
    const object = createLibraryAssetSceneObject(resolvedAsset, materials, resolvedParentId, position);
    setSceneObjects((items) => placement === "prepend" ? [object, ...items] : [...items, object]);
    selectSceneObject(object.id);
  }, [activeTransformParentId, addPrefabToScene, assetLibrary.assets, materials, selectSceneObject, setSceneObjects]);

  const addAssetToPrefab = useCallback((
    asset: SceneAsset,
    position?: Vec3,
    parentId: string | null | undefined = undefined,
    placement: Placement = "append",
  ) => {
    const resolvedAsset = resolveAssetForSceneInsertion(asset, assetLibrary.assets);
    const resolvedParentId = prefab.resolveParentId(parentId);
    if (isPrefabAsset(resolvedAsset)) {
      const sessionKey = prefab.state?.asset.filename;
      if (!sessionKey) return;
      void (async () => {
        try {
          const document = await fetchPrefabDocument({ ...resolvedAsset, kind: "prefab", path: "", sizeBytes: 0 });
          prefab.insertObjectsForSession(
            sessionKey,
            instantiatePrefabDocument(document, { parentId: resolvedParentId, position }),
            placement,
          );
        } catch (error) {
          console.error("nested prefab instantiate failed", error);
        }
      })();
      return;
    }
    if (!isImageAsset(resolvedAsset) && !isModelAsset(resolvedAsset)) return;
    prefab.insertObject(createLibraryAssetSceneObject(resolvedAsset, materials, resolvedParentId, position), placement);
  }, [assetLibrary.assets, materials, prefab]);

  const importFiles = useCallback(
    (files: FileList | File[] | null, destination = "") => importAssetFiles(files, destination, {
      refreshAssets: assetLibrary.refresh,
      createMaterials,
    }),
    [assetLibrary.refresh, createMaterials],
  );
  const modelImportSaved = useCallback((asset: LibraryAsset, doc: { importVersion: string }) => {
    const nextUrl = versionedModelAssetUrl(asset.url, doc.importVersion);
    const updateUrls = (items: SceneObject[]) => items.map((object) =>
      assetFilenameMatchesDeleted(assetFilenameFromUrl(object.assetUrl), asset.filename)
        ? { ...object, assetUrl: nextUrl }
        : object);
    setSceneObjects(updateUrls);
    if (prefabModeActive) prefab.mutateObjects(updateUrls);
    void assetLibrary.refresh();
  }, [assetLibrary, prefab, prefabModeActive, setSceneObjects]);

  useEffect(() => {
    if (!assetLibrary.loaded) return;
    const resolve = (items: SceneObject[]) => reconcileSceneAssetReferences(items, assetLibrary.assets);
    setSceneObjects(resolve);
    if (prefabSessionKey) mutatePrefabObjects(resolve);
  }, [assetLibrary.assets, assetLibrary.loaded, mutatePrefabObjects, prefabSessionKey, setSceneObjects]);

  const remove = useCallback((filename: string, kind: "model" | "image" | "prefab" | "inputActionMap") => {
    if (kind === "model" || kind === "image") {
      const markMissing = (items: SceneObject[]) => {
        let changed = false;
        const next = items.map((object) => {
          if (!assetFilenameMatchesDeleted(assetFilenameFromUrl(object.assetUrl), filename)) return object;
          changed = true;
          return { ...object, assetUrl: undefined, assetMissing: true };
        });
        return changed ? next : items;
      };
      setSceneObjects(markMissing);
      if (prefabModeActive) prefab.mutateObjects(markMissing);
    }
    setFocusedAsset(focusedAsset?.kind === kind && assetFilenameMatchesDeleted(focusedAsset.asset.filename, filename)
      ? null
      : focusedAsset);
    void assetLibrary.remove(filename);
  }, [assetLibrary, focusedAsset, prefab, prefabModeActive, setFocusedAsset, setSceneObjects]);
  const renamePrefabReferences = useCallback((filename: string, displayName: string) => {
    setSceneObjects((items) => items.map((object) => object.prefabLink?.prefabFilename === filename
      ? { ...object, prefabLink: { ...object.prefabLink, prefabName: displayName } }
      : object));
  }, [setSceneObjects]);

  return {
    addAssetToPrefab, addAssetToScene, addPrefabToScene, browserObjects, focusedUsage, images, importFiles,
    modelImportSaved, models, prefabs, inputActionMaps, removeInputActionMap: (filename: string) => remove(filename, "inputActionMap"), removeImage: (filename: string) => remove(filename, "image"),
    removeModel: (filename: string) => remove(filename, "model"),
    removePrefab: (filename: string) => remove(filename, "prefab"), renamePrefabReferences,
    saveEditedPrefab, saveScenePrefab,
  };
}

export type SceneAssetIntegrationController = ReturnType<typeof useSceneAssetIntegration>;
