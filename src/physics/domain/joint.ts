import type { PhysicsVec3 } from "./components";

export const JOINT_KINDS = ["distance", "ball", "fixed", "hinge"] as const;
/** Anchors use object-local metres (world metres when connectedObjectId is null).
 * Null connectedAnchor/restLength resolve once when Play starts. Angles are degrees.
 */
export type JointComponent = {
  version: 1; enabled: boolean; kind: typeof JOINT_KINDS[number];
  connectedObjectId: string | null; anchor: PhysicsVec3; connectedAnchor: PhysicsVec3 | null;
  axis: PhysicsVec3; restLength: number | null; collideConnected: boolean;
  limitsEnabled: boolean; minAngle: number; maxAngle: number;
};
export function defaultJoint(): JointComponent {
  return { version: 1, enabled: true, kind: "ball", connectedObjectId: null,
    anchor: [0, 0, 0], connectedAnchor: null, axis: [0, 1, 0], restLength: null,
    collideConnected: false, limitsEnabled: false, minAngle: -90, maxAngle: 90 };
}
