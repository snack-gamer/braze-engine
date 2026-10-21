import type { RigidbodyInterpolation } from "../domain/components";
import type { PhysicsVec3 } from "../domain/components";

/** Render-object origin relative to the simulated collider's world pose. */
export type PhysicsBodyBinding = {
  objectId: string;
  colliderId: string;
  objectLocalOffset: PhysicsVec3;
  objectLocalOrientation: [number, number, number, number];
  writesObjectPose: boolean;
  interpolation: RigidbodyInterpolation;
  bodyType: "static" | "dynamic" | "kinematic";
  objectPosition: PhysicsVec3;
  objectOrientation: [number, number, number, number];
};
