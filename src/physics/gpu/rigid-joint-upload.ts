import type { RigidWorldDescriptor } from "../runtime/rigid-world-descriptor";
import type { RigidJointDescriptor } from "../runtime/rigid-joint-descriptor";
import { RIGID_LAYOUT } from "./rigid-layout";

export function jointRecordCount(world: RigidWorldDescriptor) {
  return (world.joints ?? []).reduce((sum, joint) => sum + (joint.b >= 0 ? 2 : 1), 0);
}
export function packRigidJoints(world: RigidWorldDescriptor, properties: Float32Array, firstRecord: number) {
  const byBody = new Map<number, RigidJointDescriptor[]>();
  const add = (joint: RigidJointDescriptor) => { const list = byBody.get(joint.a) ?? []; list.push(joint); byBody.set(joint.a, list); };
  for (const joint of world.joints ?? []) {
    add(joint);
    if (joint.b >= 0) add({ ...joint, a: joint.b, b: joint.a, anchorA: joint.anchorB, anchorB: joint.anchorA,
      axisA: joint.axisB, axisB: joint.axisA, referenceOrientation: [-joint.referenceOrientation[0], -joint.referenceOrientation[1], -joint.referenceOrientation[2], joint.referenceOrientation[3]],
      minAngle: -joint.maxAngle, maxAngle: -joint.minAngle });
  }
  const stride = RIGID_LAYOUT.propertyBytes / 4, integers = new Uint32Array(properties.buffer);
  let record = firstRecord;
  for (const [body, joints] of byBody) {
    integers[body * stride + 18] = record; integers[body * stride + 19] = joints.length;
    for (const joint of joints) {
      const at = record++ * stride;
      properties.set([...joint.anchorA, joint.restLength], at);
      properties.set([...joint.anchorB, ["distance", "ball", "fixed", "hinge"].indexOf(joint.kind)], at + 4);
      properties.set(joint.referenceOrientation, at + 8);
      properties.set([...joint.axisA, joint.minAngle], at + 12);
      integers.set([joint.b < 0 ? 0xffffffff : joint.b, Number(joint.collideConnected), Number(joint.limitsEnabled), 0], at + 16);
      properties.set([...joint.axisB, joint.maxAngle], at + 20);
    }
  }
}
