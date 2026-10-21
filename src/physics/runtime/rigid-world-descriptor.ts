import type { PhysicsVec3 } from "../domain/components";
import type { PhysicsBodyBinding } from "./pose-binding";
import type { CollisionMaterial } from "../domain/collision-material";
import type { RigidJointDescriptor } from "./rigid-joint-descriptor";

export type RigidPrimitiveShape =
  | { kind: "sphere"; radius: number }
  | { kind: "capsule"; radius: number; halfLength: number }
  | { kind: "box"; halfExtents: PhysicsVec3 };

export type RigidTriangleShape = { kind: "triangle"; vertices: [PhysicsVec3, PhysicsVec3, PhysicsVec3]; radius: number };
export type RigidShape = RigidPrimitiveShape | RigidTriangleShape | { kind: "compound"; radius: number; children: (CollisionMaterial & {
  colliderId: string; shape: RigidPrimitiveShape; position: PhysicsVec3;
  orientation: [number, number, number, number]; friction: number;
})[] };

/** Cold, backend-neutral initialization. World coordinates are Y-up, in meters. */
export type RigidBodyDescriptor = CollisionMaterial & {
  binding: PhysicsBodyBinding;
  shape: RigidShape;
  position: PhysicsVec3;
  orientation: [number, number, number, number];
  mass: number;
  inertia: PhysicsVec3;
  /** Symmetric inertia tensor off-diagonals (xy, xz, yz), in body coordinates. */
  inertiaProducts?: PhysicsVec3;
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  friction: number;
};

export type RigidWorldDescriptor = {
  /** Cold allocation tail reserved for transactional runtime primitives. */
  runtimeBodyStart?: number;
  bodies: RigidBodyDescriptor[];
  gravity: PhysicsVec3;
  fixedTimestep: number;
  joints?: RigidJointDescriptor[];
};
