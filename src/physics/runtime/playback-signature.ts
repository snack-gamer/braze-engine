import type { SceneObject } from "../../types";
import type { PhysicsWorldSettings } from "../domain/world-settings";
import { normalizePhysicsWorldSettings } from "../domain/world-settings";

/** Hash input for deciding when authored changes require a runtime rebuild. */
export function physicsPlaybackSignature(
  objects: SceneObject[],
  worldSettings: PhysicsWorldSettings,
): string {
  const world = normalizePhysicsWorldSettings(worldSettings);
  return JSON.stringify({
    world,
    objects: objects
      .map((object) => ({
        id: object.id,
        parentId: object.parentId,
        primitive: object.primitive,
        position: object.position,
        rotation: object.rotation,
        scale: object.scale,
        rigidbody: object.rigidbody,
        colliders: object.colliders,
        joint: object.joint,
        characterController: object.characterController,
      })),
  });
}

export type PhysicsPlaybackSignatureCache = {
  get: (objects: SceneObject[], worldSettings: PhysicsWorldSettings) => string;
};

/** Authored scene/world state is immutable. Preserve that contract here so
 * the Play loop does not normalize, allocate, and stringify the whole world
 * again on every requestAnimationFrame. */
export function createPhysicsPlaybackSignatureCache(
  compute: typeof physicsPlaybackSignature = physicsPlaybackSignature,
): PhysicsPlaybackSignatureCache {
  let previousObjects: SceneObject[] | null = null;
  let previousWorldSettings: PhysicsWorldSettings | null = null;
  let previousSignature = "";
  return {
    get(objects, worldSettings) {
      if (objects !== previousObjects || worldSettings !== previousWorldSettings) {
        previousObjects = objects;
        previousWorldSettings = worldSettings;
        previousSignature = compute(objects, worldSettings);
      }
      return previousSignature;
    },
  };
}
