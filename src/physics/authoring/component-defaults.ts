import { PRIMITIVE_CUBE_SIZE, PRIMITIVE_SPHERE_RADIUS } from "../../scene/domain/primitive-dimensions";
import { DEFAULT_COLLISION_MATERIAL as MATERIAL } from "../domain/collision-material";
import type {
  ColliderAxis,
  ColliderComponent,
  ColliderShape,
  RigidbodyBodyType,
  RigidbodyComponent,
} from "../domain/components";
import type { PrimitiveKind, SceneObject, Vec3 } from "../../types";

export const DEFAULT_COLLIDER_FRICTION = 0.5;

export const RIGIDBODY_TYPE_OPTIONS: Array<{ id: RigidbodyBodyType; label: string }> = [
  { id: "dynamic", label: "Dynamic" },
  { id: "kinematic", label: "Kinematic" },
];

export const COLLIDER_SHAPE_OPTIONS: Array<{ id: ColliderShape; label: string }> = [
  { id: "box", label: "Box" },
  { id: "sphere", label: "Sphere" },
  { id: "capsule", label: "Capsule" },
  { id: "torus", label: "Torus" },
  { id: "mesh", label: "Triangle Mesh (Static)" },
];

export const COLLIDER_AXIS_OPTIONS: Array<{ id: ColliderAxis; label: string }> = [
  { id: "x", label: "X" },
  { id: "y", label: "Y" },
  { id: "z", label: "Z" },
];

export type PhysicsComponentSet = {
  rigidbody?: RigidbodyComponent;
  colliders?: ColliderComponent[];
};

const DEFAULT_COLLIDER: Omit<ColliderComponent, "id"> = {
  enabled: true,
  shape: "box",
  center: [0, 0, 0],
  size: [1, 1, 1],
  radius: 0.5,
  length: 1,
  majorRadius: 0.5,
  minorRadius: 0.12,
  friction: DEFAULT_COLLIDER_FRICTION,
  showGizmo: true,
};

export function finiteNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function positiveNumber(value: unknown, fallback: number, min = 0.001, max = 1.0e6): number {
  return finiteNumber(value, fallback, min, max);
}

export function parseVec3(value: unknown, fallback: Vec3, min = -1.0e6, max = 1.0e6): Vec3 {
  if (!Array.isArray(value)) return [...fallback];
  return [
    finiteNumber(value[0], fallback[0], min, max),
    finiteNumber(value[1], fallback[1], min, max),
    finiteNumber(value[2], fallback[2], min, max),
  ];
}

function defaultShapeForPrimitive(primitive: PrimitiveKind): ColliderShape {
  return primitive === "sphere" ? "sphere" : "box";
}

function baseSizeForPrimitive(primitive: PrimitiveKind): Vec3 {
  if (primitive === "sphere") return [PRIMITIVE_SPHERE_RADIUS * 2, PRIMITIVE_SPHERE_RADIUS * 2, PRIMITIVE_SPHERE_RADIUS * 2];
  if (primitive === "plane" || primitive === "water") return [5, 0.1, 5];
  if (primitive === "image") return [2.2, 1.35, 0.05];
  if (primitive === "particle") return [0.9, 0.9, 0.9];
  if (primitive === "fbx" || primitive === "usdz" || primitive === "usd" || primitive === "gltf") {
    return [1.7, 1.7, 1.7];
  }
  return [PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE, PRIMITIVE_CUBE_SIZE];
}

function maxComponent(values: Vec3): number {
  return Math.max(values[0], values[1], values[2]);
}

export function defaultRigidbodyForObject(
  _object: Pick<SceneObject, "primitive">,
): RigidbodyComponent {
  return {
    enabled: true,
    bodyType: "dynamic",
    massMode: "automatic",
    mass: 1,
    density: 1,
    useGravity: true,
    linearDamping: 0,
    angularDamping: 0.05,
    interpolation: "none",
  };
}

export function normalizeRigidbody(value: unknown): RigidbodyComponent {
  const raw = value && typeof value === "object" ? value as Partial<RigidbodyComponent> : {};
  return {
    enabled: raw.enabled !== false,
    bodyType: raw.bodyType === "kinematic" ? "kinematic" : "dynamic",
    massMode: raw.massMode === "manual" ? "manual" : "automatic",
    mass: positiveNumber(raw.mass, 1, 0.0001, 1.0e9),
    density: positiveNumber(raw.density, 1, 0.0001, 1.0e6),
    useGravity: raw.useGravity !== false,
    linearDamping: finiteNumber(raw.linearDamping, 0, 0, 1000),
    angularDamping: finiteNumber(raw.angularDamping, 0.05, 0, 1000),
    interpolation: raw.interpolation === "interpolate" ? "interpolate" : "none",
  };
}

export function nextColliderId(objectId: string, colliders: readonly ColliderComponent[] = []): string {
  const used = new Set(colliders.map((collider) => collider.id));
  let index = 1;
  while (used.has(`${objectId}-collider-${index}`)) index += 1;
  return `${objectId}-collider-${index}`;
}

export function defaultColliderForObject(
  object: Pick<SceneObject, "id" | "primitive"> & Partial<Pick<SceneObject, "scale" | "colliders">>,
  shape: ColliderShape = defaultShapeForPrimitive(object.primitive),
): ColliderComponent {
  const baseSize = baseSizeForPrimitive(object.primitive);
  const baseRadius = maxComponent(baseSize) * 0.5;
  const capsuleLength = Math.max(0.001, baseSize[0] - baseRadius * 2);
  return {
    ...DEFAULT_COLLIDER,
    id: nextColliderId(object.id, object.colliders),
    shape,
    size: baseSize,
    radius: baseRadius,
    length: capsuleLength,
    majorRadius: baseRadius,
    minorRadius: Math.max(0.001, baseRadius * 0.24),
  };
}

export function normalizeCollider(
  value: unknown,
  object?: Pick<SceneObject, "id" | "primitive"> & Partial<Pick<SceneObject, "scale" | "colliders">>,
  fallbackId = object ? nextColliderId(object.id, object.colliders) : "collider-1",
): ColliderComponent {
  const raw = value && typeof value === "object" ? value as Partial<ColliderComponent> : {};
  const defaultShape = object ? defaultShapeForPrimitive(object.primitive) : DEFAULT_COLLIDER.shape;
  const defaultCollider = object ? defaultColliderForObject(object, defaultShape) : { ...DEFAULT_COLLIDER, id: fallbackId };
  const shape = COLLIDER_SHAPE_OPTIONS.some((option) => option.id === raw.shape)
    ? raw.shape as ColliderShape
    : defaultShape;
  const axis = raw.axis === "x" || raw.axis === "y" || raw.axis === "z"
    ? raw.axis
    : shape === "capsule" ? "x" : undefined;
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId,
    enabled: raw.enabled !== false,
    shape,
    ...(axis ? { axis } : {}),
    ...(raw.geometry ? { geometry: { vertices: [...(raw.geometry.vertices ?? [])], indices: [...(raw.geometry.indices ?? [])] } } : {}),
    center: parseVec3(raw.center, defaultCollider.center),
    size: parseVec3(raw.size, defaultCollider.size, 0.001),
    radius: positiveNumber(raw.radius, defaultCollider.radius),
    length: positiveNumber(raw.length, defaultCollider.length),
    majorRadius: positiveNumber(raw.majorRadius, defaultCollider.majorRadius),
    minorRadius: positiveNumber(raw.minorRadius, defaultCollider.minorRadius),
    friction: finiteNumber(raw.friction, defaultCollider.friction, 0, 10),
    ...(raw.restitution === undefined ? {} : { restitution: finiteNumber(raw.restitution, MATERIAL.restitution, 0, 1) }),
    ...(raw.isTrigger === undefined ? {} : { isTrigger: raw.isTrigger === true }),
    ...(raw.collisionLayer === undefined ? {} : { collisionLayer: Math.floor(finiteNumber(raw.collisionLayer, MATERIAL.collisionLayer, 0, 31)) }),
    ...(raw.collisionMask === undefined ? {} : { collisionMask: Math.floor(finiteNumber(raw.collisionMask, MATERIAL.collisionMask, 0, 0xffffffff)) }),
    showGizmo: raw.showGizmo !== false,
  };
}

export function isDynamicPhysicsBody(object: Pick<SceneObject, "rigidbody">): boolean {
  return object.rigidbody?.enabled === true && object.rigidbody.bodyType === "dynamic";
}
