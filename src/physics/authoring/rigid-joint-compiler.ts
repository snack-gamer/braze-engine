import type { CompiledJointAuthoring } from "../runtime/contracts";
import type { RigidBodyDescriptor } from "../runtime/rigid-world-descriptor";
import type { RigidJointDescriptor } from "../runtime/rigid-joint-descriptor";
import type { PhysicsVec3 as Vec } from "../domain/components";
import { inverseCharacterQuaternion, multiplyCharacterQuaternions, rotateCharacterVector } from "../../character/runtime/pose-math";

export function compileRigidJoints(joints: readonly CompiledJointAuthoring[], bodies: readonly RigidBodyDescriptor[]): RigidJointDescriptor[] {
  const indices = new Map(bodies.map((body, index) => [body.binding.objectId, index]));
  const local = (body: RigidBodyDescriptor | undefined, point: Vec): Vec => body
    ? [...rotateCharacterVector(inverseCharacterQuaternion(body.orientation), point.map((v, i) => v - body.position[i]) as Vec)] : [...point];
  return joints.map(({ objectId, component, anchor, connectedAnchor, axis }) => {
    const a = indices.get(objectId), b = component.connectedObjectId ? indices.get(component.connectedObjectId) : -1;
    if (a === undefined || b === undefined) throw new Error(`${objectId}: joint owner and connected body require enabled colliders.`);
    const bodyA = bodies[a], bodyB = b < 0 ? undefined : bodies[b];
    const end = connectedAnchor ?? (component.kind === "distance" && bodyB ? bodyB.binding.objectPosition : anchor);
    const rotationB = bodyB?.orientation ?? [0, 0, 0, 1] as const;
    const length = Math.hypot(...axis), direction: Vec = length > 1e-8 ? axis.map((v) => v / length) as Vec : [0, 1, 0];
    return { a, b, kind: component.kind, anchorA: local(bodyA, anchor), anchorB: local(bodyB, end),
      axisA: [...rotateCharacterVector(inverseCharacterQuaternion(bodyA.orientation), direction)],
      axisB: [...rotateCharacterVector(inverseCharacterQuaternion(rotationB), direction)],
      referenceOrientation: [...multiplyCharacterQuaternions(inverseCharacterQuaternion(bodyA.orientation), rotationB)],
      restLength: component.restLength ?? Math.hypot(...anchor.map((v, i) => v - end[i])),
      collideConnected: component.collideConnected, limitsEnabled: component.limitsEnabled,
      minAngle: component.minAngle * Math.PI / 180, maxAngle: component.maxAngle * Math.PI / 180 };
  });
}
