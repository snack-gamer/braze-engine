import type { SceneObject } from "../../scene/domain/scene-object";
import { characterControllerBackingIssue } from "../../character-controller/application/character-controller-authoring";
import { captureRuntimeCharacter } from "../../character-controller/domain/runtime-character";
import { normalizeCollider, normalizeRigidbody } from "../../physics/authoring/component-defaults";
import type { RigidBodyDescriptor } from "../../physics/runtime/rigid-world-descriptor";
import type { HierarchyWorldTransform } from "../../physics/authoring/hierarchy-world";
import { rotateCharacterVector } from "../../character/runtime/pose-math";
import { EntityWorldError } from "../../world/domain/entity-world";
import type { RuntimeCharacter } from "../../character-controller/domain/runtime-character";
import type { RuntimeVector3 } from "../../world/domain/runtime-primitive";

/** Existing authored backing rules plus the explicit runtime single-capsule subset. */
export function validateRuntimePrefabCharacter(object: SceneObject): void {
  if (!object.characterController?.enabled) return;
  const fail = (message: string): never => { throw new EntityWorldError("unsupported-component", `${object.name}: ${message}`); };
  if (!object.rigidbody) return fail("Character Controller needs an enabled Kinematic Rigidbody.");
  const rigidbody = normalizeRigidbody(object.rigidbody);
  const colliders = object.colliders?.map((collider) => normalizeCollider(collider, object));
  const normalized = { ...object, rigidbody, colliders };
  const issue = characterControllerBackingIssue(normalized);
  if (issue) fail(issue);
  if (rigidbody.interpolation !== "none") fail("Runtime Character Controller requires Rigidbody interpolation None.");
  if (colliders?.length !== 1 || colliders[0].shape !== "capsule" || colliders[0].axis !== "y" || colliders[0].geometry) fail("Runtime Character Controller requires exactly one solid Y-axis Capsule Collider.");
  if (object.animator?.enabled && object.animator.rootMotion.mode === "applyToObject" && object.animator.rootMotion.rotation === "full") fail("Runtime Character Controller root motion supports yaw rotation only; use extractOnly for full rotation.");
}

/** Cold compiler output supplies capsule dimensions/material; authored code owns all defaults. */
export function compileRuntimePrefabCharacter(object: SceneObject, pose: HierarchyWorldTransform, body: RigidBodyDescriptor | undefined, render?: RuntimeCharacter["render"]): RuntimeCharacter {
  validateRuntimePrefabCharacter(object);
  if (!body || body.shape.kind !== "capsule" || body.binding.bodyType !== "kinematic") throw new EntityWorldError("unsupported-component", `${object.name}: expected one compiled kinematic capsule.`);
  const up = rotateCharacterVector(pose.orientation, [0, 1, 0]);
  const bodyUp = rotateCharacterVector(body.orientation, [0, 1, 0]);
  if (pose.hasShear || up[1] < 1 - 1e-5 || Math.abs(bodyUp[1]) < 1 - 1e-5) throw new EntityWorldError("invalid-command", `${object.name}: runtime Character Controller requires a non-sheared, world-upright yaw transform.`);
  const forward = rotateCharacterVector(pose.orientation, [0, 0, 1]);
  const yaw = Math.atan2(forward[0], forward[2]) * 180 / Math.PI;
  return captureRuntimeCharacter({ position: pose.position, rotation: [0, yaw, 0],
    capsule: { id: body.binding.colliderId, radius: body.shape.radius, halfLength: body.shape.halfLength,
      center: body.binding.objectLocalOffset.map((n) => -n) as unknown as RuntimeVector3 },
    movement: object.characterController!.movement,
    physics: { linearDamping: body.linearDamping, angularDamping: body.angularDamping, friction: body.friction,
      restitution: body.restitution, collisionLayer: body.collisionLayer, collisionMask: body.collisionMask }, render });
}
