import { useCallback, type Dispatch, type SetStateAction } from "react";
import { defaultCameraSettings } from "../../constants";
import type { HistoryUpdater } from "../../history/history-state";
import { makeObject } from "../../lib/payload";
import { markSceneOverrides } from "../../lib/prefab-authoring";
import type { CameraState, ModifierPinSelection, PrimitiveKind, SceneObject, Vec3 } from "../../types";
import {
  deleteObjectSubtrees,
  duplicateObjectSubtrees,
  insertParentAboveSelection,
  moveObjectInTree,
} from "../authoring/object-tree";
import type { ObjectTransformPatch } from "../authoring/live-transform";
import {
  commitAuthoredObjectTransform,
  deleteActiveSceneObject,
  duplicateActiveSceneObject,
  normalizeSceneObjectPatch,
  updateAuthoredSceneObject,
  updateBuoyancyPin,
} from "../authoring/scene-object-commands";

type SetSceneObjects = (updater: HistoryUpdater<SceneObject[]>) => void;

type UseSceneObjectCommandsInput = {
  objects: SceneObject[];
  activeObjectId: string;
  activeTransformParentId?: string;
  camera: CameraState;
  setObjects: SetSceneObjects;
  selectObject: (id: string) => void;
  setActiveObjectId: Dispatch<SetStateAction<string>>;
  setSelectedModifierPin: Dispatch<SetStateAction<ModifierPinSelection | null>>;
  recordTransformEdit: (id: string, transform: ObjectTransformPatch) => void;
};

export function useSceneObjectCommands(input: UseSceneObjectCommandsInput) {
  const {
    objects,
    activeObjectId,
    activeTransformParentId,
    camera,
    setObjects,
    selectObject,
    setActiveObjectId,
    setSelectedModifierPin,
    recordTransformEdit,
  } = input;

  const duplicateActive = useCallback(() => {
    setObjects((items) => {
      const result = duplicateActiveSceneObject(items, activeObjectId);
      if (result.selectedObjectId) setActiveObjectId(result.selectedObjectId);
      return result.objects;
    });
  }, [activeObjectId, setActiveObjectId, setObjects]);

  const duplicateObjects = useCallback((ids: string[]) => {
    setObjects((items) => {
      const result = duplicateObjectSubtrees(items, ids, {
        idSuffix: "dup",
        rootOffset: 0.6,
        remapPrefabInstances: true,
      });
      if (result.firstCloneId) selectObject(result.firstCloneId);
      return result.objects;
    });
  }, [selectObject, setObjects]);

  const deleteActive = useCallback(() => {
    setObjects((items) => {
      const result = deleteActiveSceneObject(items, activeObjectId);
      if (result.selectedObjectId) setActiveObjectId(result.selectedObjectId);
      return result.objects;
    });
  }, [activeObjectId, setActiveObjectId, setObjects]);

  const deleteObjects = useCallback((ids: string[]) => {
    setObjects((items) => {
      const next = deleteObjectSubtrees(items, ids, { requireCamera: true });
      if (next !== items && !next.some((object) => object.id === activeObjectId) && next[0]) {
        selectObject(next[0].id);
      }
      return next;
    });
  }, [activeObjectId, selectObject, setObjects]);

  const addCamera = useCallback(() => {
    const cameraCount = objects.filter((object) => object.primitive === "camera").length;
    const created = makeObject("camera", Date.now() % 1000, {
      name: `Camera ${cameraCount + 1}`,
      position: [...camera.position],
      camera: {
        ...defaultCameraSettings,
        target: [...camera.target],
        fov: camera.fov,
      },
    });
    setObjects((items) => [...items, created]);
    selectObject(created.id);
  }, [camera, objects, selectObject, setObjects]);

  const addEmptyTransform = useCallback((parentId?: string) => {
    const object = makeObject("transform", objects.length, {
      name: "Transform",
      parentId,
      ...(parentId ? { position: [0, 0, 0] as Vec3 } : {}),
    });
    setObjects((items) => [...items, object]);
    selectObject(object.id);
  }, [objects.length, selectObject, setObjects]);

  const createEmptyParent = useCallback((ids: string[]) => {
    setObjects((items) => {
      const parent = makeObject("transform", Date.now() % 1000, {
        name: "Transform Parent",
        position: [0, 0, 0],
      });
      const next = insertParentAboveSelection(items, ids, parent, {
        decorateChild: (child) => markSceneOverrides(
          child,
          child.camera ? ["hierarchy", "transform", "camera"] : ["hierarchy", "transform"],
        ),
      });
      if (next !== items) selectObject(parent.id);
      return next;
    });
  }, [selectObject, setObjects]);

  const frameObject = useCallback((id: string) => {
    selectObject(id);
    window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" })), 0);
  }, [selectObject]);

  const updateObject = useCallback((id: string, patch: Partial<SceneObject>) => {
    const safePatch = normalizeSceneObjectPatch(patch);
    const transformChanged = "position" in safePatch || "rotation" in safePatch || "scale" in safePatch;
    const target = transformChanged ? objects.find((object) => object.id === id) : null;
    if (target) {
      recordTransformEdit(id, {
        position: safePatch.position ?? target.position,
        rotation: safePatch.rotation ?? target.rotation,
        scale: safePatch.scale ?? target.scale,
      });
    }
    setObjects((items) => updateAuthoredSceneObject(items, id, safePatch));
  }, [objects, recordTransformEdit, setObjects]);

  const moveObject = useCallback(
    (sourceId: string, targetId: string, position: "before" | "after" | "child") => {
      setObjects((items) => moveObjectInTree(items, sourceId, targetId, position, {
        appendAfterDescendants: true,
        decorateMovedObject: (object) => markSceneOverrides(
          object,
          object.camera ? ["hierarchy", "transform", "camera"] : ["hierarchy", "transform"],
        ),
      }));
    },
    [setObjects],
  );

  const updateObjectTransform = useCallback((id: string, transform: ObjectTransformPatch) => {
    setObjects((items) => commitAuthoredObjectTransform(items, id, transform));
  }, [setObjects]);

  const updateAnimatedObjectTransform = useCallback((id: string, transform: ObjectTransformPatch) => {
    updateObjectTransform(id, transform);
    recordTransformEdit(id, transform);
  }, [recordTransformEdit, updateObjectTransform]);

  const updateModifierPin = useCallback(
    (objectId: string, modifierId: string, pinId: string, localOffset: Vec3) => {
      setSelectedModifierPin({ objectId, modifierId, pinId });
      const target = objects.find((object) => object.id === objectId);
      if (target) updateObject(objectId, updateBuoyancyPin(target, modifierId, pinId, localOffset));
    },
    [objects, setSelectedModifierPin, updateObject],
  );

  const addPrimitive = useCallback((kind: PrimitiveKind) => {
    const object = makeObject(kind, objects.length, {
      parentId: activeTransformParentId,
      ...(activeTransformParentId ? { position: [0, 0, 0] as Vec3 } : {}),
    });
    setObjects((items) => [...items, object]);
    selectObject(object.id);
  }, [activeTransformParentId, objects.length, selectObject, setObjects]);

  return {
    addCamera,
    addEmptyTransform,
    addPrimitive,
    createEmptyParent,
    deleteActive,
    deleteObjects,
    duplicateActive,
    duplicateObjects,
    frameObject,
    moveObject,
    updateAnimatedObjectTransform,
    updateModifierPin,
    updateObject,
    updateObjectTransform,
  };
}
