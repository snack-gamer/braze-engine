import {
  defaultColliderForObject,
  defaultRigidbodyForObject,
  normalizeCollider,
  normalizeRigidbody,
} from "../../physics/authoring/component-defaults";
import type { ColliderComponent } from "../../physics/domain/components";
import type { SceneObject } from "../../scene/domain/scene-object";
import { CHARACTER_CONTROLLER_VERSION } from "../domain/character-controller";

export function characterControllerUnavailableReason(object: SceneObject): string | undefined {
  if (object.characterController) return "This object already has a Character Controller.";
  if (object.dimension === "2d" || object.primitive === "camera") {
    return "Character Controller requires a 3D scene object.";
  }
  if (object.rigidbody?.enabled && object.rigidbody.bodyType === "dynamic") {
    return "Character Controller requires a Kinematic Rigidbody; switch this Dynamic Rigidbody first.";
  }
  return undefined;
}

export function createCharacterControllerPatch(object: SceneObject): Partial<SceneObject> {
  const capsules = object.colliders
    ?.map((collider, index) => normalizeCollider(collider, object, `${object.id}-collider-${index + 1}`))
    .filter((collider) => collider.enabled && collider.shape === "capsule") ?? [];
  const existingCapsule = capsules.find(
    (collider) => collider.id === object.characterController?.capsuleColliderId,
  ) ?? capsules[0];
  const capsule = existingCapsule ?? defaultCharacterCapsule(object);
  const rigidbody = normalizeRigidbody({
    ...(object.rigidbody ?? defaultRigidbodyForObject(object)),
    enabled: true,
    bodyType: "kinematic",
    useGravity: false,
  });
  return {
    characterController: {
      version: CHARACTER_CONTROLLER_VERSION,
      enabled: true,
      capsuleColliderId: capsule.id,
      ...(object.characterController?.movement ? { movement: object.characterController.movement } : {}),
    },
    rigidbody,
    colliders: existingCapsule ? object.colliders : [...(object.colliders ?? []), capsule],
  };
}

export function characterControllerBackingIssue(object: SceneObject): string | undefined {
  const component = object.characterController;
  if (!component?.enabled) return undefined;
  if (object.rigidbody?.enabled !== true || object.rigidbody.bodyType !== "kinematic") {
    return "Character Controller needs an enabled Kinematic Rigidbody.";
  }
  const collider = object.colliders?.find((entry) => entry.id === component.capsuleColliderId);
  if (!collider || !collider.enabled || collider.shape !== "capsule") {
    return "Character Controller needs its referenced Capsule Collider enabled.";
  }
  if (collider.isTrigger) return "Character Controller capsule must be solid, not a trigger.";
  return undefined;
}

function defaultCharacterCapsule(object: SceneObject): ColliderComponent {
  return {
    ...defaultColliderForObject(object, "capsule"),
    axis: "y",
    center: [0, 0.9, 0],
    radius: 0.35,
    length: 1.1,
    friction: 0,
  };
}
