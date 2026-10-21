import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { defaultCameraSettings } from "../../constants";
import type { HistoryUpdater } from "../../history/history-state";
import { isAvatarBotObject } from "../../lib/bots";
import type { LibraryAsset } from "../../lib/api";
import { updatePrefabAsset } from "../../lib/api";
import { rotationToCameraTarget } from "../../lib/camera-math";
import { makeObject } from "../../lib/payload";
import { withPrefabRoots } from "../../lib/prefab-authoring";
import { encodePrefabDocument } from "../serialization/prefab-document";
import {
  PREFAB_DOCUMENT_VERSION,
  fetchPrefabDocumentSnapshot,
  updatePrefabLinkedInstances,
} from "../../lib/prefabs";
import {
  deleteObjectSubtrees,
  duplicateObjectSubtrees,
  insertParentAboveSelection,
  moveObjectInTree,
} from "../../scene/authoring/object-tree";
import type { ObjectTransformPatch } from "../../scene/authoring/live-transform";
import { clampScaleVec } from "../../scene/domain/transform-values";
import type {
  CameraState,
  ModifierPinSelection,
  PrimitiveKind,
  SceneObject,
  Vec3,
} from "../../types";
import {
  beginPrefabSave,
  completePrefabSave,
  createPrefabEditorState,
  failPrefabSave,
  redoPrefabEditorState,
  undoPrefabEditorState,
  updatePrefabEditorObjects,
  type PrefabEditorState,
} from "../authoring/prefab-editor-state";

type SetSceneObjects = (updater: HistoryUpdater<SceneObject[]>) => void;

type PrefabEditorSessionInput = {
  camera: CameraState;
  activeSceneObjectId: string;
  setSceneObjects: SetSceneObjects;
  setActiveSceneObjectId: (id: string) => void;
  refreshAssets: () => Promise<void>;
  onEntered: () => void;
  onSelectedObject: (id: string) => void;
  setSelectedModifierPin: Dispatch<SetStateAction<ModifierPinSelection | null>>;
};

export function usePrefabEditorSession(input: PrefabEditorSessionInput) {
  const {
    camera,
    activeSceneObjectId,
    setSceneObjects,
    setActiveSceneObjectId,
    refreshAssets,
    onEntered,
    onSelectedObject,
    setSelectedModifierPin,
  } = input;
  const [state, setState] = useState<PrefabEditorState | null>(null);
  const openGenerationRef = useRef(0);
  const objects = state?.doc.objects ?? [];
  const masterRootId = state?.doc.rootIds[0] ?? null;
  const activeObject = state
    ? objects.find((object) => object.id === state.selectedId) ?? objects[0] ?? null
    : null;
  const activeCameraId = objects.find((object) => object.primitive === "camera")?.id ?? "";

  const close = useCallback(() => {
    openGenerationRef.current += 1;
    setState(null);
  }, []);
  const undo = useCallback(() => setState((current) => current ? undoPrefabEditorState(current) : current), []);
  const redo = useCallback(() => setState((current) => current ? redoPrefabEditorState(current) : current), []);
  const mutateObjects = useCallback((
    updater: (items: SceneObject[]) => SceneObject[],
    nextSelectedId?: string | null,
  ) => {
    setState((current) => current
      ? updatePrefabEditorObjects(current, updater, nextSelectedId)
      : current);
  }, []);

  const open = useCallback(async (asset: LibraryAsset) => {
    const generation = ++openGenerationRef.current;
    try {
      const { document, revision } = await fetchPrefabDocumentSnapshot(asset);
      if (generation !== openGenerationRef.current) return;
      onEntered();
      setState(createPrefabEditorState(asset, document, revision));
    } catch (error) {
      if (generation !== openGenerationRef.current) return;
      onEntered();
      setState(createPrefabEditorState(asset, {
        version: PREFAB_DOCUMENT_VERSION,
        name: asset.name,
        createdAt: new Date().toISOString(),
        rootIds: [],
        objects: [],
      }, null, error instanceof Error ? error.message : String(error)));
    }
  }, [onEntered]);

  const save = useCallback(() => {
    const pending = state;
    if (!pending) return;
    setState((current) => current ? beginPrefabSave(current) : current);
    void (async () => {
      const doc = withPrefabRoots(pending.doc);
      try {
        const result = await updatePrefabAsset(
          pending.asset.filename,
          doc.name,
          encodePrefabDocument(doc),
          pending.revision,
          pending.asset.guid,
        );
        setState((current) => current
          ? completePrefabSave(current, pending, result.asset, doc, result.revision)
          : current);
        setSceneObjects((items) => {
          const next = updatePrefabLinkedInstances(items, doc, result.asset);
          if (activeSceneObjectId && !next.some((object) => object.id === activeSceneObjectId) && next[0]) {
            setActiveSceneObjectId(next[0].id);
          }
          return next;
        });
        try {
          await refreshAssets();
        } catch (error) {
          console.error("prefab asset refresh failed", error);
        }
      } catch (error) {
        setState((current) => current ? failPrefabSave(current, pending, error) : current);
      }
    })();
  }, [activeSceneObjectId, refreshAssets, setActiveSceneObjectId, setSceneObjects, state]);

  const selectObject = useCallback((id: string) => {
    setState((current) => current ? { ...current, selectedId: id } : current);
    setSelectedModifierPin((selection) => selection?.objectId === id ? selection : null);
    onSelectedObject(id);
  }, [onSelectedObject, setSelectedModifierPin]);

  const resolveParentId = useCallback((parentId?: string | null) => {
    if (!masterRootId) return undefined;
    if (parentId === null) return masterRootId;
    if (parentId !== undefined) {
      return objects.some((object) => object.id === parentId) ? parentId : masterRootId;
    }
    return activeObject?.primitive === "transform" && activeObject.id !== masterRootId
      ? activeObject.id
      : masterRootId;
  }, [activeObject, masterRootId, objects]);

  const updateObject = useCallback((id: string, patch: Partial<SceneObject>) => {
    const safePatch = id === masterRootId
      ? (({ name: _name, parentId: _parentId, primitive: _primitive, renderVisible: _visible, prefabLink: _link, ...rest }) => rest)(patch)
      : patch;
    if (Object.keys(safePatch).length === 0) return;
    mutateObjects((items) => {
      if (safePatch.botProfileId && items.some((item) => item.id !== id && item.botProfileId === safePatch.botProfileId)) {
        return items;
      }
      return items.map((item) => item.id === id ? { ...item, ...safePatch } : item);
    });
  }, [masterRootId, mutateObjects]);

  const assignMaterial = useCallback((objectId: string, materialId: string | null) => {
    const target = objects.find((object) => object.id === objectId);
    if (materialId && target && isAvatarBotObject(target)) return;
    updateObject(objectId, { materialId: materialId ?? undefined });
  }, [objects, updateObject]);

  const deleteObjects = useCallback((ids: string[]) => {
    const protectedIds = masterRootId ? new Set([masterRootId]) : undefined;
    mutateObjects((items) => deleteObjectSubtrees(items, ids, { protectedIds }));
  }, [masterRootId, mutateObjects]);

  const duplicateObjects = useCallback((ids: string[]) => {
    const duplicableIds = ids.filter((id) => id !== masterRootId);
    if (duplicableIds.length === 0) return;
    const result = duplicateObjectSubtrees(objects, duplicableIds, {
      idSuffix: "prefab-dup",
      rootOffset: 0.4,
      remapPrefabInstances: false,
    });
    mutateObjects(() => result.objects, result.firstCloneId);
  }, [masterRootId, mutateObjects, objects]);

  const moveObject = useCallback((sourceId: string, targetId: string, position: "before" | "after" | "child") => {
    mutateObjects((items) => moveObjectInTree(items, sourceId, targetId, position, {
      protectedRootId: masterRootId,
    }), sourceId);
  }, [masterRootId, mutateObjects]);

  const insertObject = useCallback((object: SceneObject, placement: "append" | "prepend" = "append") => {
    mutateObjects((items) => placement === "prepend" ? [object, ...items] : [...items, object], object.id);
  }, [mutateObjects]);
  const insertObjects = useCallback((next: SceneObject[], placement: "append" | "prepend" = "append") => {
    if (next.length === 0) return;
    mutateObjects((items) => placement === "prepend" ? [...next, ...items] : [...items, ...next], next[0].id);
  }, [mutateObjects]);
  const insertObjectsForSession = useCallback((
    sessionKey: string,
    next: SceneObject[],
    placement: "append" | "prepend" = "append",
  ) => {
    if (next.length === 0) return;
    setState((current) => {
      if (!current || current.asset.filename !== sessionKey) return current;
      return updatePrefabEditorObjects(
        current,
        (items) => placement === "prepend" ? [...next, ...items] : [...items, ...next],
        next[0].id,
      );
    });
  }, []);

  const addPrimitive = useCallback((kind: PrimitiveKind) => {
    const parentId = resolveParentId();
    insertObject(makeObject(kind, objects.length, {
      parentId,
      ...(parentId ? { position: [0, 0, 0] as Vec3 } : {}),
    }));
  }, [insertObject, objects.length, resolveParentId]);
  const addCamera = useCallback(() => {
    const cameraCount = objects.filter((object) => object.primitive === "camera").length;
    insertObject(makeObject("camera", Date.now() % 1000, {
      name: `Camera ${cameraCount + 1}`,
      parentId: resolveParentId(),
      position: [...camera.position],
      camera: { ...defaultCameraSettings, target: [...camera.target], fov: camera.fov },
    }));
  }, [camera, insertObject, objects, resolveParentId]);
  const createEmpty = useCallback((parentId?: string) => {
    const resolvedParentId = resolveParentId(parentId);
    insertObject(makeObject("transform", objects.length, {
      name: "Transform",
      parentId: resolvedParentId,
      ...(resolvedParentId ? { position: [0, 0, 0] as Vec3 } : {}),
    }));
  }, [insertObject, objects.length, resolveParentId]);
  const createEmptyParent = useCallback((ids: string[]) => {
    const requested = ids.filter((id) => id !== masterRootId);
    if (requested.length === 0) return;
    const parent = makeObject("transform", Date.now() % 1000, {
      name: "Transform Parent",
      parentId: masterRootId ?? undefined,
      position: [0, 0, 0],
    });
    mutateObjects((items) => insertParentAboveSelection(items, requested, parent), parent.id);
  }, [masterRootId, mutateObjects]);

  const updateObjectTransform = useCallback((id: string, transform: ObjectTransformPatch) => {
    mutateObjects((items) => items.map((object) => {
      if (object.id !== id) return object;
      if (object.primitive === "camera" && object.camera) {
        return {
          ...object,
          position: transform.position,
          camera: {
            ...object.camera,
            target: transform.cameraTarget
              ?? rotationToCameraTarget(transform.position, transform.rotation, object.camera.target),
          },
        };
      }
      return { ...object, position: transform.position, rotation: transform.rotation, scale: clampScaleVec(transform.scale) };
    }));
  }, [mutateObjects]);
  const updateModifierPin = useCallback((objectId: string, modifierId: string, pinId: string, localOffset: Vec3) => {
    setSelectedModifierPin({ objectId, modifierId, pinId });
    const target = objects.find((object) => object.id === objectId);
    if (!target) return;
    updateObject(objectId, {
      modifiers: target.modifiers?.map((modifier) => modifier.id !== modifierId || modifier.type !== "buoyancy"
        ? modifier
        : { ...modifier, pins: modifier.pins.map((pin) => pin.id === pinId ? { ...pin, localOffset } : pin) }),
    });
  }, [objects, setSelectedModifierPin, updateObject]);
  const frameObject = useCallback((id: string) => {
    selectObject(id);
    window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" })), 0);
  }, [selectObject]);

  return useMemo(() => ({
    state, objects, activeObject, activeObjectId: activeObject?.id ?? "", activeCameraId,
    masterRootId, open, close, save, undo, redo, mutateObjects, selectObject,
    resolveParentId, updateObject, assignMaterial, deleteObjects, duplicateObjects, moveObject,
    insertObject, insertObjects, insertObjectsForSession, addPrimitive, addCamera, createEmpty, createEmptyParent,
    updateObjectTransform, updateModifierPin, frameObject,
  }), [
    state, objects, activeObject, activeCameraId, masterRootId, open, close, save, undo, redo,
    mutateObjects, selectObject, resolveParentId, updateObject, assignMaterial, deleteObjects,
    duplicateObjects, moveObject, insertObject, insertObjects, insertObjectsForSession, addPrimitive, addCamera,
    createEmpty, createEmptyParent, updateObjectTransform, updateModifierPin, frameObject,
  ]);
}

export type PrefabEditorController = ReturnType<typeof usePrefabEditorSession>;
