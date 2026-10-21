import type { SceneObject } from "../types";

export type AnimatableObjectRow = {
  object: SceneObject;
  depth: number;
};

function childrenMap(objects: SceneObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const children = new Map<string | null, SceneObject[]>();
  for (const object of objects) {
    const parentId = object.parentId && byId.has(object.parentId) && object.parentId !== object.id
      ? object.parentId
      : null;
    const list = children.get(parentId);
    if (list) list.push(object);
    else children.set(parentId, [object]);
  }
  return { byId, children };
}

export function findAnimationPlayerRoot(objects: SceneObject[], activeObjectId: string): SceneObject | null {
  const { byId } = childrenMap(objects);
  let current = byId.get(activeObjectId) ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.animationPlayer && current.animationPlayer.enabled !== false) return current;
    current = current.parentId ? byId.get(current.parentId) ?? null : null;
  }
  return null;
}

export function animationPlayerSubtree(objects: SceneObject[], rootId: string | null): AnimatableObjectRow[] {
  if (!rootId) return [];
  const { byId, children } = childrenMap(objects);
  const root = byId.get(rootId);
  if (!root) return [];
  const rows: AnimatableObjectRow[] = [];
  const seen = new Set<string>();
  const visit = (object: SceneObject, depth: number) => {
    if (seen.has(object.id)) return;
    seen.add(object.id);
    rows.push({ object, depth });
    for (const child of children.get(object.id) ?? []) visit(child, depth + 1);
  };
  visit(root, 0);
  return rows;
}
