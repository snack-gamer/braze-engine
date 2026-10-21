import type { CollisionMaterial } from "./collision-material";
export type PhysicsVec3 = [number, number, number];

/** Public authoring types. Independent of the GPU solver. */
export type RigidbodyBodyType = "dynamic" | "kinematic";
export type RigidbodyMassMode = "automatic" | "manual";
export type RigidbodyInterpolation = "none" | "interpolate";
export type ColliderShape = "box" | "sphere" | "capsule" | "torus" | "mesh";
export type ColliderAxis = "x" | "y" | "z";

export type ColliderComponent = CollisionMaterial & {
  id: string;
  enabled: boolean;
  shape: ColliderShape;
  /** Longitudinal axis for capsules. Older projects default to X. */
  axis?: ColliderAxis;
  /** Explicit, object-local collision geometry snapshot. Static triangle surfaces. */
  geometry?: { vertices: number[]; indices: number[] };
  center: PhysicsVec3;
  size: PhysicsVec3;
  radius: number;
  length: number;
  majorRadius: number;
  minorRadius: number;
  friction: number;
  showGizmo: boolean;
};

export type RigidbodyComponent = {
  enabled: boolean;
  bodyType: RigidbodyBodyType;
  massMode: RigidbodyMassMode;
  mass: number;
  density: number;
  useGravity: boolean;
  linearDamping: number;
  angularDamping: number;
  interpolation: RigidbodyInterpolation;
};
