import type {
  ColliderComponent,
  RigidbodyInterpolation,
  RigidbodyMassMode,
} from "../domain/components";
import type { PhysicsWorldSettings } from "../domain/world-settings";
import type { Vec3 } from "../../types";
import type { Quat4 } from "../authoring/coordinates";
import type { JointComponent } from "../domain/joint";

export type CompiledJointAuthoring = { objectId: string; component: JointComponent; anchor: Vec3; connectedAnchor: Vec3 | null; axis: Vec3 };

export type CompiledPhysicsBodyType = "static" | "dynamic" | "kinematic";

export type CompiledPhysicsBody = {
  objectId: string;
  colliderOwnerId: string;
  colliderId: string;
  compoundId: string;
  writesObjectPose: boolean;
  bodyType: CompiledPhysicsBodyType;
  massMode: RigidbodyMassMode;
  mass: number;
  density: number;
  useGravity: boolean;
  linearDamping: number;
  angularDamping: number;
  interpolation: RigidbodyInterpolation;
  position: Vec3;
  orientation: Quat4;
  /** Rigidbody owner world pose before the collider-center offset is applied. */
  objectPosition: Vec3;
  objectOrientation: Quat4;
  worldScale: Vec3;
  /** Offset from collider-centered solver pose back to the authored object origin. */
  objectLocalOffset: Vec3;
  objectLocalOrientation: Quat4;
  collider: ColliderComponent;
};

export type CompiledPhysicsScene = {
  name: string;
  settings: PhysicsWorldSettings;
  bodies: CompiledPhysicsBody[];
  diagnostics: PhysicsCompileDiagnostic[];
  joints?: CompiledJointAuthoring[];
};

export type PhysicsCompileDiagnostic = {
  severity: "warning" | "error";
  code: "unsupported-sheared-transform" | "missing-collider" | "invalid-joint";
  objectId: string;
  message: string;
};
