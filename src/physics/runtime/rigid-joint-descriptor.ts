import type { PhysicsVec3 } from "../domain/components";
import type { JointComponent } from "../domain/joint";

export type RigidJointDescriptor = {
  a: number; b: number; // -1 is a fixed world anchor
  kind: JointComponent["kind"]; anchorA: PhysicsVec3; anchorB: PhysicsVec3;
  axisA: PhysicsVec3; axisB: PhysicsVec3; referenceOrientation: [number, number, number, number];
  restLength: number; collideConnected: boolean; limitsEnabled: boolean; minAngle: number; maxAngle: number;
};
