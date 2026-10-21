import {
  botColorProfiles,
  botProfilePatch,
  isAvatarBotObject,
  nextAvailableBotProfile,
  usedBotProfileIds,
} from "../../lib/bots";
import type { SceneObject } from "../../types";
import { transformForParent, wouldCreateCycle } from "../../lib/hierarchy";
import { createAuthoredId } from "../../identity/authored-id";
import { remapBehaviorReferences } from "../../behaviors/domain/behavior-references";

function withDescendants(objects: SceneObject[], requestedIds: ReadonlySet<string>): Set<string> {
  const included = new Set(requestedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of objects) {
      if (object.parentId && included.has(object.parentId) && !included.has(object.id)) {
        included.add(object.id);
        changed = true;
      }
    }
  }
  return included;
}

type DuplicateObjectSubtreesOptions = {
  idSuffix: string;
  rootOffset: number;
  remapPrefabInstances: boolean;
  createObjectId?: (index: number) => string;
  createPrefabInstanceId?: (index: number) => string;
};

export type DuplicateObjectSubtreesResult = {
  objects: SceneObject[];
  firstCloneId: string | null;
};

/** Duplicates selected roots and their descendants without breaking hierarchy identity. */
export function duplicateObjectSubtrees(
  objects: SceneObject[],
  requestedIds: string[],
  options: DuplicateObjectSubtreesOptions,
): DuplicateObjectSubtreesResult {
  const requested = new Set(requestedIds);
  if (requested.size === 0) return { objects, firstCloneId: null };
  const included = withDescendants(objects, requested);
  const originals = objects.filter((object) => included.has(object.id));
  if (originals.length === 0) return { objects, firstCloneId: null };

  const botCloneCount = originals.filter(isAvatarBotObject).length;
  const availableBotProfiles = botColorProfiles.length - usedBotProfileIds(objects).size;
  if (botCloneCount > availableBotProfiles) return { objects, firstCloneId: null };

  const idMap = new Map(
    originals.map((object, index) => [
      object.id,
      options.createObjectId?.(index) ?? createAuthoredId("obj"),
    ]),
  );
  const prefabInstanceMap = new Map<string, string>();
  const stagedClones: SceneObject[] = [];
  const clones = originals.map((object): SceneObject => {
    const parentId = object.parentId ? idMap.get(object.parentId) ?? object.parentId : undefined;
    const prefabLink = object.prefabLink && options.remapPrefabInstances
      ? {
          ...object.prefabLink,
          instanceId:
            prefabInstanceMap.get(object.prefabLink.instanceId)
            ?? (() => {
              const nextId = options.createPrefabInstanceId?.(prefabInstanceMap.size)
                ?? createAuthoredId("prefab-inst");
              prefabInstanceMap.set(object.prefabLink!.instanceId, nextId);
              return nextId;
            })(),
        }
      : object.prefabLink;
    const clone: SceneObject = {
      ...object,
      id: idMap.get(object.id)!,
      name: `${object.name} copy`,
      parentId,
      prefabLink,
      behaviors: remapBehaviorReferences(object.behaviors, idMap),
      joint: object.joint ? { ...object.joint, connectedObjectId: object.joint.connectedObjectId ? idMap.get(object.joint.connectedObjectId) ?? object.joint.connectedObjectId : null } : undefined,
      position: [
        object.position[0] + (parentId ? 0 : options.rootOffset),
        object.position[1],
        object.position[2] + (parentId ? 0 : options.rootOffset),
      ],
    };
    if (isAvatarBotObject(object)) {
      const profile = nextAvailableBotProfile([...objects, ...stagedClones]);
      if (profile) Object.assign(clone, botProfilePatch(profile, clone));
    }
    stagedClones.push(clone);
    return clone;
  });
  const firstRequestedClone = requestedIds.find((id) => idMap.has(id));
  return {
    objects: [...objects, ...clones],
    firstCloneId: firstRequestedClone ? idMap.get(firstRequestedClone)! : null,
  };
}

type DeleteObjectSubtreesOptions = {
  protectedIds?: ReadonlySet<string>;
  requireCamera?: boolean;
};

/** Deletes selected roots and descendants while enforcing scene/prefab invariants. */
export function deleteObjectSubtrees(
  objects: SceneObject[],
  requestedIds: string[],
  options: DeleteObjectSubtreesOptions = {},
): SceneObject[] {
  if (objects.length <= 1 || requestedIds.length === 0) return objects;
  const protectedIds = options.protectedIds ?? new Set<string>();
  const requested = new Set(requestedIds.filter((id) => !protectedIds.has(id)));
  if (requested.size === 0) return objects;
  const doomed = withDescendants(objects, requested);
  for (const id of protectedIds) doomed.delete(id);
  const next = objects.filter((object) => !doomed.has(object.id));
  if (next.length === 0) return objects;
  if (options.requireCamera && !next.some((object) => object.primitive === "camera")) return objects;
  return next;
}

type InsertParentOptions = {
  decorateChild?: (object: SceneObject) => SceneObject;
};

/** Inserts one authored parent above the selected roots while preserving world transforms. */
export function insertParentAboveSelection(
  objects: SceneObject[],
  requestedIds: string[],
  parent: SceneObject,
  options: InsertParentOptions = {},
): SceneObject[] {
  const selectedIds = new Set(requestedIds);
  if (selectedIds.size === 0) return objects;
  const selected = objects.filter((object) => selectedIds.has(object.id));
  if (selected.length === 0) return objects;
  const selectedRoots = selected.filter((object) => {
    let parentId = object.parentId;
    const visited = new Set<string>();
    while (parentId) {
      if (selectedIds.has(parentId)) return false;
      if (visited.has(parentId)) break;
      visited.add(parentId);
      parentId = objects.find((candidate) => candidate.id === parentId)?.parentId;
    }
    return true;
  });
  const rootIds = new Set(selectedRoots.map((object) => object.id));
  const withParent = [parent, ...objects];
  return [
    parent,
    ...objects.map((object) => {
      if (!rootIds.has(object.id)) return object;
      const nextTransform = transformForParent(withParent, object, parent.id);
      const child: SceneObject = {
        ...object,
        parentId: parent.id,
        position: nextTransform.position,
        rotation: nextTransform.rotation,
        scale: nextTransform.scale,
        camera:
          object.camera && nextTransform.cameraTarget
            ? { ...object.camera, target: nextTransform.cameraTarget }
            : object.camera,
      };
      return options.decorateChild?.(child) ?? child;
    }),
  ];
}

type MoveObjectOptions = {
  protectedRootId?: string | null;
  appendAfterDescendants?: boolean;
  decorateMovedObject?: (object: SceneObject) => SceneObject;
};

/** Reparents and reorders one object atomically while preserving its world transform. */
export function moveObjectInTree(
  objects: SceneObject[],
  sourceId: string,
  targetId: string,
  position: "before" | "after" | "child",
  options: MoveObjectOptions = {},
): SceneObject[] {
  if (sourceId === targetId || sourceId === options.protectedRootId) return objects;
  const source = objects.find((object) => object.id === sourceId);
  const target = objects.find((object) => object.id === targetId);
  if (!source || !target || wouldCreateCycle(objects, sourceId, targetId)) return objects;

  const resolvedPosition = target.id === options.protectedRootId && position !== "child" ? "child" : position;
  const requestedParentId = resolvedPosition === "child"
    ? targetId
    : target.parentId ?? options.protectedRootId ?? undefined;
  const newParentId = requestedParentId && objects.some((object) => object.id === requestedParentId)
    ? requestedParentId
    : options.protectedRootId ?? undefined;
  if (newParentId === sourceId || (options.protectedRootId && !newParentId)) return objects;

  const without = objects.filter((object) => object.id !== sourceId);
  const nextTransform = transformForParent(objects, source, newParentId);
  const moved: SceneObject = {
    ...source,
    parentId: newParentId,
    position: nextTransform.position,
    rotation: nextTransform.rotation,
    scale: nextTransform.scale,
    camera:
      source.camera && nextTransform.cameraTarget
        ? { ...source.camera, target: nextTransform.cameraTarget }
        : source.camera,
  };
  const updated = options.decorateMovedObject?.(moved) ?? moved;

  if (resolvedPosition === "child") {
    let insertAt = without.findIndex((object) => object.id === targetId) + 1;
    if (options.appendAfterDescendants) {
      while (insertAt < without.length) {
        let ancestorId = without[insertAt].parentId;
        const visited = new Set<string>();
        let descendant = false;
        while (ancestorId) {
          if (ancestorId === targetId) {
            descendant = true;
            break;
          }
          if (visited.has(ancestorId)) break;
          visited.add(ancestorId);
          ancestorId = without.find((object) => object.id === ancestorId)?.parentId;
        }
        if (!descendant) break;
        insertAt += 1;
      }
    }
    return [...without.slice(0, insertAt), updated, ...without.slice(insertAt)];
  }

  const targetIndex = without.findIndex((object) => object.id === targetId);
  if (targetIndex === -1) return objects;
  const insertAt = resolvedPosition === "before" ? targetIndex : targetIndex + 1;
  return [...without.slice(0, insertAt), updated, ...without.slice(insertAt)];
}
