import type { SceneObject } from "../../scene/domain/scene-object";

const captures = new WeakMap<readonly SceneObject[], boolean>();

/** Immutable authored references make discovery cold; frames never rescan the scene. */
export function sceneHasBehaviors(objects: readonly SceneObject[]): boolean {
  const previous = captures.get(objects);
  if (previous !== undefined) return previous;
  const result = objects.some((object) => object.behaviors && (object.behaviors.unavailable || object.behaviors.entries.length > 0));
  captures.set(objects, result);
  return result;
}
