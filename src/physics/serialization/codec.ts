import type {
  ColliderComponent,
  RigidbodyComponent,
} from "../domain/components";
import type { SceneObject } from "../../types";
import {
  type PhysicsComponentSet,
  normalizeCollider,
  normalizeRigidbody,
} from "../authoring/component-defaults";
import {
  DEFAULT_PHYSICS_WORLD_SETTINGS,
  normalizePhysicsWorldSettings,
  type PhysicsWorldSettings,
} from "../domain/world-settings";

type ObjectIdentity = Pick<SceneObject, "id" | "primitive">;

export function serializePhysicsWorldSettings(settings: PhysicsWorldSettings | undefined) {
  const world = normalizePhysicsWorldSettings(settings);
  return {
    gravity: world.gravity,
    fixed_timestep: world.fixedTimestep,
    max_substeps: world.maxSubsteps,
    version: 1,
  };
}

export function parsePhysicsWorldSettings(raw: unknown): PhysicsWorldSettings {
  if (!raw || typeof raw !== "object") return normalizePhysicsWorldSettings(DEFAULT_PHYSICS_WORLD_SETTINGS);
  const value = raw as Record<string, unknown>;
  return normalizePhysicsWorldSettings({
    gravity: value.gravity,
    fixedTimestep: value.fixed_timestep ?? value.fixedTimestep,
    maxSubsteps: value.max_substeps ?? value.maxSubsteps,

  });
}

export function serializeRigidbody(component: RigidbodyComponent | undefined) {
  if (!component) return null;
  const rigidbody = normalizeRigidbody(component);
  return {
    enabled: rigidbody.enabled,
    body_type: rigidbody.bodyType,
    mass_mode: rigidbody.massMode,
    mass: rigidbody.mass,
    density: rigidbody.density,
    use_gravity: rigidbody.useGravity,
    linear_damping: rigidbody.linearDamping,
    angular_damping: rigidbody.angularDamping,
    interpolation: rigidbody.interpolation,
  };
}

export function serializeCollider(component: ColliderComponent) {
  const collider = normalizeCollider(component, undefined, component.id);
  return {
    id: collider.id,
    enabled: collider.enabled,
    shape: collider.shape,
    ...(collider.geometry ? { geometry: collider.geometry } : {}),
    ...(collider.axis ? { axis: collider.axis } : {}),
    center: collider.center,
    size: collider.size,
    radius: collider.radius,
    length: collider.length,
    major_radius: collider.majorRadius,
    minor_radius: collider.minorRadius,
    friction: collider.friction,
    ...(collider.restitution === undefined ? {} : { restitution: collider.restitution }),
    ...(collider.isTrigger === undefined ? {} : { is_trigger: collider.isTrigger }),
    ...(collider.collisionLayer === undefined ? {} : { collision_layer: collider.collisionLayer }),
    ...(collider.collisionMask === undefined ? {} : { collision_mask: collider.collisionMask }),
    show_gizmo: collider.showGizmo,
  };
}

export function serializeColliders(components: ColliderComponent[] | undefined) {
  return components?.map(serializeCollider) ?? [];
}

function parseRigidbody(raw: unknown): RigidbodyComponent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  return normalizeRigidbody({
    enabled: value.enabled,
    bodyType: value.body_type ?? value.bodyType,
    massMode: value.mass_mode ?? value.massMode,
    mass: value.mass,
    density: value.density,
    useGravity: value.use_gravity ?? value.useGravity,
    linearDamping: value.linear_damping ?? value.linearDamping,
    angularDamping: value.angular_damping ?? value.angularDamping,
    interpolation: value.interpolation,
  });
}

function parseCollider(raw: unknown, object: ObjectIdentity, index: number): ColliderComponent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  return normalizeCollider({
    id: value.id,
    enabled: value.enabled,
    shape: value.shape,
    geometry: value.geometry,
    axis: value.axis,
    center: value.center,
    size: value.size,
    radius: value.radius,
    length: value.length,
    majorRadius: value.major_radius ?? value.majorRadius,
    minorRadius: value.minor_radius ?? value.minorRadius,
    friction: value.friction,
    restitution: value.restitution,
    isTrigger: value.is_trigger ?? value.isTrigger,
    collisionLayer: value.collision_layer ?? value.collisionLayer,
    collisionMask: value.collision_mask ?? value.collisionMask,
    showGizmo: value.show_gizmo ?? value.showGizmo,
  }, object, `${object.id}-collider-${index + 1}`);
}

/** Current component format only. Unsupported shapes remain authored for explicit diagnostics. */
export function parsePhysicsComponents(item: unknown, object: ObjectIdentity): PhysicsComponentSet {
  if (!item || typeof item !== "object") return {};
  const value = item as Record<string, unknown>;
  const colliders = Array.isArray(value.colliders)
    ? value.colliders.map((collider, index) => parseCollider(collider, object, index))
      .filter((collider): collider is ColliderComponent => Boolean(collider)) : [];
  return { rigidbody: parseRigidbody(value.rigidbody), colliders: colliders.length ? colliders : undefined };
}
