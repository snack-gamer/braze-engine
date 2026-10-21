import type { SceneObject } from "../../scene/domain/scene-object";
import { EntityWorldError, type WorldEntity } from "../../world/domain/entity-world";

/** Collider children share their nearest Rigidbody's mass and GPU shape allocation. */
export function authoredDestructionDependencies(objects: readonly SceneObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const owners = new Map<string, string>();
  for (const object of objects) {
    if (!object.colliders?.some((collider) => collider.enabled) || object.rigidbody?.enabled) continue;
    let parent = object.parentId ? byId.get(object.parentId) : undefined;
    const visited = new Set([object.id]);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (parent.rigidbody?.enabled) { owners.set(object.id, parent.id); break; }
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  return (removed: readonly WorldEntity[]) => {
    const ids = new Set(removed.map((entity) => entity.authoredId));
    for (const id of ids) {
      const owner = id ? owners.get(id) : undefined;
      if (owner && !ids.has(owner)) throw new EntityWorldError("missing-dependency",
        `Collider on '${id}' belongs to Rigidbody '${owner}'. Destroy its Rigidbody subtree; removing part of a compound body is not supported yet.`);
    }
  };
}
