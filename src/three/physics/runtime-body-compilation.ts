import type { WorldEntity } from "../../world/domain/entity-world";
import type { RuntimePrimitive } from "../../world/domain/runtime-primitive";
import type { RigidBodyDescriptor } from "../../physics/runtime/rigid-world-descriptor";
import type { PhysicsWorldSettings } from "../../physics/domain/world-settings";
import type { SceneObject } from "../../scene/domain/scene-object";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { defaultColliderForObject, defaultRigidbodyForObject } from "../../physics/authoring/component-defaults";

/** Render data stays distinct from the character's sole kinematic capsule. */
export function runtimeBodyRenderPrimitive(entity: WorldEntity): RuntimePrimitive | undefined {
  if (entity.primitive) return entity.primitive;
  const character = entity.character;
  return character?.render ? { ...character.render, position: character.position, rotation: character.rotation, mass: 1 } : undefined;
}

/** Adapt runtime descriptors through the authored compiler's existing coordinates/defaults. */
export function compileRuntimeBody(entity: WorldEntity, id: string, settings: PhysicsWorldSettings): RigidBodyDescriptor {
  const character = entity.character, spec = character ?? entity.primitive!;
  const object: SceneObject = { id, name: entity.name, primitive: "cube", position: [...spec.position],
    rotation: [...(spec.rotation ?? [0, 0, 0])], scale: [1, 1, 1], color: runtimeBodyRenderPrimitive(entity)?.color ?? "#ffffff", visible: true, locked: false };
  const { linearDamping, angularDamping, ...material } = spec.physics ?? {};
  object.rigidbody = { ...defaultRigidbodyForObject(object), enabled: true, bodyType: character ? "kinematic" : "dynamic",
    massMode: "manual", mass: entity.primitive?.mass ?? 1 };
  if (character) object.rigidbody.useGravity = false;
  else if (entity.primitive?.physics?.useGravity !== undefined) object.rigidbody.useGravity = entity.primitive.physics.useGravity;
  if (linearDamping !== undefined) object.rigidbody.linearDamping = linearDamping;
  if (angularDamping !== undefined) object.rigidbody.angularDamping = angularDamping;
  const collider = { ...defaultColliderForObject(object), ...material };
  if (character) {
    object.colliders = [{ ...collider, id: character.capsule.id, shape: "capsule", axis: "y", isTrigger: false,
      center: [...character.capsule.center], radius: character.capsule.radius, length: character.capsule.halfLength * 2 }];
  } else {
    const primitive = entity.primitive!, shape = primitive.collider?.shape ?? primitive.shape;
    const center = [...(primitive.collider?.center ?? [0, 0, 0])] as [number, number, number];
    object.colliders = [shape.kind === "box" ? { ...collider, center, shape: "box", size: [...shape.size] }
      : { ...collider, center, shape: "sphere", radius: shape.radius }];
  }
  const compiled = compileRigidWorld(compileAuthoredPhysicsScene([object], "runtime-body", settings));
  if (compiled.bodies.length !== 1) throw new Error("A runtime entity must compile to exactly one body.");
  return compiled.bodies[0];
}
