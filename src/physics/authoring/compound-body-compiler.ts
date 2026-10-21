import type { RigidBodyDescriptor, RigidShape } from "../runtime/rigid-world-descriptor";
import type { PhysicsVec3 as Vec } from "../domain/components";
import { inverseCharacterQuaternion, multiplyCharacterQuaternions, rotateCharacterVector } from "../../character/runtime/pose-math";

/** Merge collider masses using the parallel-axis theorem, retaining the full tensor. */
export function compileCompoundBodies(bodies: RigidBodyDescriptor[]): RigidBodyDescriptor[] {
  const groups = new Map<string, RigidBodyDescriptor[]>();
  for (const body of bodies) {
    const key = body.binding.bodyType === "static" ? `static:${body.binding.objectId}:${body.binding.colliderId}` : `body:${body.binding.objectId}`;
    const group = groups.get(key) ?? []; group.push(body); groups.set(key, group);
  }
  return [...groups.values()].map((group) => group.length === 1 ? group[0] : compound(group));
}

function compound(group: RigidBodyDescriptor[]): RigidBodyDescriptor {
  const first = group[0], mass = group.reduce((sum, body) => sum + body.mass, 0);
  const position: Vec = mass > 0 ? [0, 1, 2].map((i) => group.reduce((sum, body) => sum + body.position[i] * body.mass, 0) / mass) as Vec : [...first.binding.objectPosition];
  const orientation = first.binding.objectOrientation, inverse = inverseCharacterQuaternion(orientation);
  const diagonal: Vec = [0, 0, 0], products: Vec = [0, 0, 0];
  const children: Extract<RigidShape, { kind: "compound" }>["children"] = group.map((body) => {
    if (body.shape.kind === "compound" || body.shape.kind === "triangle") throw new Error("Compound compilation expects primitive colliders.");
    const offset = [...rotateCharacterVector(inverse, body.position.map((v, i) => v - position[i]) as Vec)] as Vec;
    const rotation = [...multiplyCharacterQuaternions(inverse, body.orientation)] as [number, number, number, number];
    const axes = ([ [1, 0, 0], [0, 1, 0], [0, 0, 1] ] as Vec[]).map((axis) => rotateCharacterVector(rotation, axis));
    const squared = offset.reduce((sum, v) => sum + v * v, 0);
    for (let i = 0; i < 3; i++) diagonal[i] += axes.reduce((sum, axis, j) => sum + body.inertia[j] * axis[i] ** 2, 0) + body.mass * (squared - offset[i] ** 2);
    for (const [index, a, b] of [[0, 0, 1], [1, 0, 2], [2, 1, 2]]) products[index] += axes.reduce((sum, axis, j) => sum + body.inertia[j] * axis[a] * axis[b], 0) - body.mass * offset[a] * offset[b];
    return { colliderId: body.binding.colliderId, shape: body.shape, position: offset, orientation: rotation, friction: body.friction,
      restitution: body.restitution, collisionLayer: body.collisionLayer, collisionMask: body.collisionMask, isTrigger: body.isTrigger };
  });
  const radius = Math.max(...children.map((child) => Math.hypot(...child.position) + (child.shape.kind === "box"
    ? Math.hypot(...child.shape.halfExtents) : child.shape.radius + (child.shape.kind === "capsule" ? child.shape.halfLength : 0))));
  if (![...position, ...diagonal, ...products, mass, radius].every(Number.isFinite)) throw new Error(`${first.binding.objectId}: compound mass properties exceed the finite range.`);
  return { ...first, position, orientation: [...orientation], mass, inertia: diagonal, inertiaProducts: products,
    shape: { kind: "compound", radius, children }, binding: { ...first.binding, writesObjectPose: true,
      objectLocalOffset: [...rotateCharacterVector(inverse, first.binding.objectPosition.map((v, i) => v - position[i]) as Vec)], objectLocalOrientation: [0, 0, 0, 1] } };
}
