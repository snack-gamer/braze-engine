import type { SceneObject } from "../../types";

/**
 * Chooses useful authored content before editor utility objects.
 * Explicit saved selections are resolved by the caller and always win.
 */
export function defaultActiveSceneObjectId(objects: readonly SceneObject[]): string {
  return objects.find((object) => (
    object.primitive !== "camera" && object.primitive !== "directionalLight"
  ))?.id
    ?? objects[0]?.id
    ?? "";
}
