import type { Material, SceneObject } from "../../types";

export type SceneReconciliationInput = {
  objects: readonly SceneObject[];
  materials: readonly Material[];
  hiddenGeneratorSourceIds: ReadonlySet<string>;
  /** Narrow bridge for authored domains outside SceneObject, such as motion clips. */
  dependentObjectIds?: ReadonlySet<string>;
};

export type SceneReconciliationSnapshot = {
  objects: readonly SceneObject[];
  objectsById: ReadonlyMap<string, SceneObject>;
  materialsById: ReadonlyMap<string, Material>;
  materialDependentsById: ReadonlyMap<string, ReadonlySet<string>>;
  childrenByParentId: ReadonlyMap<string, ReadonlySet<string>>;
  hiddenGeneratorSourceIds: ReadonlySet<string>;
  editorChromeObjectIds: ReadonlySet<string>;
  colliderObjectIds: ReadonlySet<string>;
  hasSolo: boolean;
};

export type SceneReconciliationPlan = {
  previous: SceneReconciliationSnapshot | null;
  next: SceneReconciliationSnapshot;
  addedObjectIds: ReadonlySet<string>;
  removedObjectIds: ReadonlySet<string>;
  changedObjectIds: ReadonlySet<string>;
  changedMaterialIds: ReadonlySet<string>;
  materialDependentObjectIds: ReadonlySet<string>;
  hierarchyDependentObjectIds: ReadonlySet<string>;
  worldTransformRootIds: ReadonlySet<string>;
  syncObjectIds: ReadonlySet<string>;
  presentationObjectIds: ReadonlySet<string>;
};

function addToIndex(index: Map<string, Set<string>>, key: string | undefined, value: string): void {
  if (!key) return;
  const values = index.get(key) ?? new Set<string>();
  values.add(value);
  index.set(key, values);
}

function buildSnapshot(input: SceneReconciliationInput): SceneReconciliationSnapshot {
  const objectsById = new Map<string, SceneObject>();
  const materialDependentsById = new Map<string, Set<string>>();
  const childrenByParentId = new Map<string, Set<string>>();
  const editorChromeObjectIds = new Set<string>();
  const colliderObjectIds = new Set<string>();
  let hasSolo = false;

  for (const object of input.objects) {
    objectsById.set(object.id, object);
    addToIndex(materialDependentsById, object.materialId, object.id);
    for (const binding of object.importedMaterialBindings ?? []) {
      addToIndex(materialDependentsById, binding.materialId, object.id);
    }
    addToIndex(childrenByParentId, object.parentId, object.id);
    if (object.primitive === "camera" || object.primitive === "directionalLight") {
      editorChromeObjectIds.add(object.id);
    }
    if ((object.colliders?.length ?? 0) > 0) colliderObjectIds.add(object.id);
    hasSolo ||= object.solo === true;
  }

  return {
    objects: input.objects,
    objectsById,
    materialsById: new Map(input.materials.map((material) => [material.id, material])),
    materialDependentsById,
    childrenByParentId,
    hiddenGeneratorSourceIds: new Set(input.hiddenGeneratorSourceIds),
    editorChromeObjectIds,
    colliderObjectIds,
    hasSolo,
  };
}

function changedReferenceIds<T>(
  previous: ReadonlyMap<string, T>,
  next: ReadonlyMap<string, T>,
): { added: Set<string>; removed: Set<string>; changed: Set<string> } {
  const added = new Set<string>();
  const removed = new Set<string>();
  const changed = new Set<string>();
  for (const [id, value] of next) {
    const oldValue = previous.get(id);
    if (oldValue === undefined) added.add(id);
    else if (oldValue !== value) changed.add(id);
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) removed.add(id);
  }
  return { added, removed, changed };
}

function addIndexedValues(
  target: Set<string>,
  index: ReadonlyMap<string, ReadonlySet<string>>,
  keys: Iterable<string>,
): void {
  for (const key of keys) {
    for (const id of index.get(key) ?? []) target.add(id);
  }
}

function symmetricDifference(target: Set<string>, left: ReadonlySet<string>, right: ReadonlySet<string>): void {
  for (const id of left) if (!right.has(id)) target.add(id);
  for (const id of right) if (!left.has(id)) target.add(id);
}

function vec3Changed(previous: readonly number[], next: readonly number[]): boolean {
  return previous.some((value, index) => value !== next[index]);
}

function worldTransformChanged(previous: SceneObject, next: SceneObject): boolean {
  const previousCameraTarget = previous.primitive === "camera" ? previous.camera?.target : undefined;
  const nextCameraTarget = next.primitive === "camera" ? next.camera?.target : undefined;
  return previous.parentId !== next.parentId
    || vec3Changed(previous.position, next.position)
    || vec3Changed(previous.rotation, next.rotation)
    || vec3Changed(previous.scale, next.scale)
    || Boolean(previousCameraTarget) !== Boolean(nextCameraTarget)
    || Boolean(previousCameraTarget && nextCameraTarget && vec3Changed(previousCameraTarget, nextCameraTarget));
}

function minimalWorldTransformRoots(
  candidates: ReadonlySet<string>,
  objectsById: ReadonlyMap<string, SceneObject>,
): Set<string> {
  const roots = new Set(candidates);
  for (const id of candidates) {
    const seen = new Set([id]);
    let parentId = objectsById.get(id)?.parentId;
    while (parentId && !seen.has(parentId)) {
      if (candidates.has(parentId)) {
        roots.delete(id);
        break;
      }
      seen.add(parentId);
      parentId = objectsById.get(parentId)?.parentId;
    }
  }
  return roots;
}

/**
 * Plans runtime work from immutable authored references.
 *
 * Planning currently indexes an authored array in O(N); applying the result is
 * O(changes). A future entity command store can feed the same explicit sets
 * without changing the runtime application boundary.
 */
export function createSceneReconciliationPlan(
  previous: SceneReconciliationSnapshot | null,
  input: SceneReconciliationInput,
): SceneReconciliationPlan {
  const next = buildSnapshot(input);
  const objectChanges = previous
    ? changedReferenceIds(previous.objectsById, next.objectsById)
    : { added: new Set(next.objectsById.keys()), removed: new Set<string>(), changed: new Set<string>() };
  const materialChanges = previous
    ? changedReferenceIds(previous.materialsById, next.materialsById)
    : { added: new Set(next.materialsById.keys()), removed: new Set<string>(), changed: new Set<string>() };
  const changedMaterialIds = new Set([
    ...materialChanges.added,
    ...materialChanges.removed,
    ...materialChanges.changed,
  ]);
  const materialDependentObjectIds = new Set<string>();
  const hierarchyDependentObjectIds = new Set<string>();

  addIndexedValues(materialDependentObjectIds, next.materialDependentsById, changedMaterialIds);
  if (previous) {
    addIndexedValues(materialDependentObjectIds, previous.materialDependentsById, changedMaterialIds);
    addIndexedValues(hierarchyDependentObjectIds, previous.childrenByParentId, objectChanges.removed);
    addIndexedValues(hierarchyDependentObjectIds, next.childrenByParentId, objectChanges.added);
  }

  const worldTransformCandidates = new Set(hierarchyDependentObjectIds);
  if (previous) {
    for (const id of objectChanges.changed) {
      const previousObject = previous.objectsById.get(id);
      const nextObject = next.objectsById.get(id);
      if (previousObject && nextObject && worldTransformChanged(previousObject, nextObject)) {
        worldTransformCandidates.add(id);
      }
    }
  }
  const worldTransformRootIds = minimalWorldTransformRoots(worldTransformCandidates, next.objectsById);

  const syncObjectIds = new Set([
    ...objectChanges.added,
    ...objectChanges.changed,
    ...materialDependentObjectIds,
    ...hierarchyDependentObjectIds,
    ...(input.dependentObjectIds ?? []),
  ]);
  for (const id of objectChanges.removed) syncObjectIds.delete(id);
  for (const id of [...syncObjectIds]) if (!next.objectsById.has(id)) syncObjectIds.delete(id);

  const presentationObjectIds = new Set(syncObjectIds);
  if (previous) {
    symmetricDifference(
      presentationObjectIds,
      previous.hiddenGeneratorSourceIds,
      next.hiddenGeneratorSourceIds,
    );
    if (previous.hasSolo !== next.hasSolo) {
      for (const id of next.objectsById.keys()) presentationObjectIds.add(id);
    }
  }

  return {
    previous,
    next,
    addedObjectIds: objectChanges.added,
    removedObjectIds: objectChanges.removed,
    changedObjectIds: objectChanges.changed,
    changedMaterialIds,
    materialDependentObjectIds,
    hierarchyDependentObjectIds,
    worldTransformRootIds,
    syncObjectIds,
    presentationObjectIds,
  };
}
