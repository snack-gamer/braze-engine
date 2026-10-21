import type { SceneObject } from "../types";

export type HierarchyRow = {
  object: SceneObject;
  depth: number;
  hasChildren: boolean;
  /** Whether each nesting level continues to a later visible sibling. */
  guides: readonly boolean[];
  /** This object or an ancestor has visibility off, so the whole subtree is hidden. */
  inactive: boolean;
  /** First object of a prefab instance in its branch; instance members below it are not roots. */
  prefabRoot: boolean;
};

type HierarchyIndex = {
  objectById: Map<string, SceneObject>;
  childrenByParent: Map<string | null, SceneObject[]>;
};

export function buildHierarchyIndex(objects: SceneObject[]): HierarchyIndex {
  const objectById = new Map(objects.map((object) => [object.id, object]));
  const childrenByParent = new Map<string | null, SceneObject[]>();
  for (const object of objects) {
    const parentId = object.parentId;
    const key = parentId && parentId !== object.id && objectById.has(parentId) ? parentId : null;
    const children = childrenByParent.get(key);
    if (children) children.push(object);
    else childrenByParent.set(key, [object]);
  }
  return { objectById, childrenByParent };
}

function searchableObjectText(object: SceneObject): string {
  return [object.name, object.primitive, object.assetName, object.assetNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function searchIncludedIds(
  objects: SceneObject[],
  objectById: ReadonlyMap<string, SceneObject>,
  query: string,
): Set<string> | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;
  const included = new Set<string>();
  for (const object of objects) {
    if (!searchableObjectText(object).includes(normalizedQuery)) continue;
    included.add(object.id);
    let parentId = object.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      included.add(parentId);
      parentId = objectById.get(parentId)?.parentId;
    }
  }
  return included;
}

/** Flattens the authored hierarchy once, retaining authored sibling order. */
export function flattenHierarchyRows(
  objects: SceneObject[],
  collapsed: ReadonlySet<string>,
  searchQuery = "",
): HierarchyRow[] {
  const { objectById, childrenByParent } = buildHierarchyIndex(objects);
  const included = searchIncludedIds(objects, objectById, searchQuery);
  const rows: HierarchyRow[] = [];
  const seen = new Set<string>();

  const markHiddenSubtree = (parentId: string) => {
    const stack = [...(childrenByParent.get(parentId) ?? [])].reverse();
    while (stack.length > 0) {
      const child = stack.pop();
      if (!child) continue;
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const descendants = childrenByParent.get(child.id) ?? [];
      for (let index = descendants.length - 1; index >= 0; index -= 1) {
        stack.push(descendants[index]);
      }
    }
  };

  const visit = (roots: readonly SceneObject[], rootDepth: number) => {
    const stack = roots.slice().reverse().map((object) => ({
      object,
      depth: rootDepth,
      guides: [] as boolean[],
      parentInactive: false,
      parentInstanceId: undefined as string | undefined,
    }));
    while (stack.length > 0) {
      const entry = stack.pop();
      if (!entry) continue;
      const { object, depth, guides } = entry;
      if (seen.has(object.id) || (included && !included.has(object.id))) continue;
      seen.add(object.id);
      const children = (childrenByParent.get(object.id) ?? []).filter(
        (child) => !included || included.has(child.id),
      );
      const inactive = entry.parentInactive || !object.visible;
      const instanceId = object.prefabLink?.instanceId;
      rows.push({
        object,
        depth,
        hasChildren: children.length > 0,
        guides,
        inactive,
        prefabRoot: instanceId !== undefined && instanceId !== entry.parentInstanceId,
      });
      if (!included && collapsed.has(object.id)) {
        markHiddenSubtree(object.id);
        continue;
      }
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({
          object: children[index],
          depth: depth + 1,
          guides: [...guides, index < children.length - 1],
          parentInactive: inactive,
          parentInstanceId: instanceId,
        });
      }
    }
  };

  visit(childrenByParent.get(null) ?? [], 0);
  // Malformed cycles should remain authorable instead of silently disappearing.
  for (const object of objects) {
    if (!seen.has(object.id) && (!included || included.has(object.id))) visit([object], 0);
  }
  return rows;
}

export function canDeleteHierarchySelection(
  objects: SceneObject[],
  selectedIds: readonly string[],
  options: { lockedRootId?: string | null; requireCamera?: boolean } = {},
): boolean {
  if (objects.length <= 1 || selectedIds.length === 0) return false;
  const deletable = selectedIds.filter((id) => id !== options.lockedRootId);
  if (deletable.length === 0) return false;
  const doomed = new Set(deletable);
  const { childrenByParent } = buildHierarchyIndex(objects);
  const queue = [...deletable];
  for (let index = 0; index < queue.length; index += 1) {
    for (const child of childrenByParent.get(queue[index]) ?? []) {
      if (doomed.has(child.id)) continue;
      doomed.add(child.id);
      queue.push(child.id);
    }
  }
  const survivors = objects.filter((object) => !doomed.has(object.id));
  return survivors.length > 0 && (!options.requireCamera || survivors.some((object) => object.primitive === "camera"));
}
