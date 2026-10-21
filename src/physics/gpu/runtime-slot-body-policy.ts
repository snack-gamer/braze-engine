import type { RigidBodyDescriptor } from "../runtime/rigid-world-descriptor";
import { finiteQuaternion, rotateCharacterVector } from "../../character/runtime/pose-math";

/** Reserved slots support existing dynamics or one upright, solid character capsule. */
export function assertRuntimeSlotBody(body: RigidBodyDescriptor): void {
  if (body.binding.bodyType === "dynamic" && body.mass > 0 && ["box", "sphere"].includes(body.shape.kind)) return;
  const axis = rotateCharacterVector(body.orientation, [0, 1, 0]);
  if (body.binding.bodyType === "kinematic" && body.mass === 0 && body.shape.kind === "capsule"
    && body.shape.radius > 0 && body.shape.halfLength > 0 && !body.isTrigger && body.gravityScale === 0
    && finiteQuaternion(body.orientation) && Math.abs(axis[1]) > 1 - 1e-5) return;
  throw new Error("Runtime slots support dynamic boxes/spheres or solid world-upright kinematic character capsules.");
}
