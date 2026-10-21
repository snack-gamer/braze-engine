import { DEFAULT_COLLISION_MATERIAL as MATERIAL } from "../domain/collision-material";
import type { RigidBodyDescriptor, RigidPrimitiveShape, RigidWorldDescriptor } from "../runtime/rigid-world-descriptor";
import { RIGID_LAYOUT as L } from "./rigid-layout";
import { jointRecordCount, packRigidJoints } from "./rigid-joint-upload";

export function packRigidBodies(world: RigidWorldDescriptor) {
  const count = world.bodies.length;
  const initialPositions = new Float32Array(count * 4);
  const initialOrientations = new Float32Array(count * 4);
  const records = count + jointRecordCount(world) + world.bodies.reduce((sum, body) => sum + (body.shape.kind === "compound" ? body.shape.children.length : 0), 0);
  if (records >= 2 ** 24) throw new Error("Compound property indices exceed exact f32 indexing.");
  const properties = new Float32Array(records * L.propertyBytes / 4);
  const integers = new Uint32Array(properties.buffer);
  const material = (value: RigidBodyDescriptor | Extract<RigidBodyDescriptor["shape"], { kind: "compound" }>["children"][number], at: number) => {
    const restitution = value.restitution ?? MATERIAL.restitution;
    properties[at + 15] = value.isTrigger ? -1 - restitution : restitution;
    integers[at + 16] = 1 << (value.collisionLayer ?? MATERIAL.collisionLayer);
    integers[at + 17] = value.collisionMask ?? MATERIAL.collisionMask;
  };
  let childRecord = count;
  world.bodies.forEach((body, index) => {
    initialPositions.set([...body.position, body.binding.bodyType === "kinematic" ? -1 : body.mass], index * 4);
    initialOrientations.set(body.orientation, index * 4);
    const offset = index * L.propertyBytes / 4;
    if (body.shape.kind === "compound") {
      properties.set([childRecord, body.shape.children.length, body.shape.radius, 3], offset);
      for (const child of body.shape.children) {
        const at = childRecord++ * L.propertyBytes / 4;
        properties.set(packShape(child.shape), at);
        properties.set([...child.position, child.friction], at + 4);
        properties.set(child.orientation, at + 8);
        material(child, at);
      }
    } else if (body.shape.kind === "triangle") {
      properties.set([body.shape.radius, 0, body.shape.radius, 4], offset);
    } else properties.set(packShape(body.shape), offset);
    const inverse = inverseTensor(body);
    properties.set([...inverse.slice(0, 3), body.mass > 0 ? 1 / body.mass : 0], offset + 4);
    properties.set([body.gravityScale, body.linearDamping, body.angularDamping, body.friction], offset + 8);
    properties.set(inverse.slice(3), offset + 12);
    material(body, offset);
    if (body.shape.kind === "triangle") {
      properties.set(body.shape.vertices[0], offset + 20);
      properties.set(body.shape.vertices[1], offset + 24);
      properties.set(body.shape.vertices[2], offset + 8);
    }
  });
  packRigidJoints(world, properties, childRecord);
  // The layer/mask lanes contain uint32 bits, which can encode NaN as floats.
  const finiteProperties = properties.every((value, index) => index % (L.propertyBytes / 4) >= 16 && index % (L.propertyBytes / 4) < 20 || Number.isFinite(value));
  if (!finiteProperties || ![initialPositions, initialOrientations].every((values) => values.every(Number.isFinite))) {
    throw new Error("Rigid body properties exceed the finite f32 simulation range.");
  }
  return { initialPositions, initialOrientations, properties };
}

function packShape(shape: RigidPrimitiveShape) {
  return shape.kind === "sphere" ? [shape.radius, 0, 0, 1]
    : shape.kind === "capsule" ? [shape.radius, shape.halfLength, 0, 2] : [...shape.halfExtents, 0];
}
function inverseTensor(body: RigidBodyDescriptor): number[] {
  if (body.mass === 0) return [0, 0, 0, 0, 0, 0];
  const [a, b, c] = body.inertia, [d, e, f] = body.inertiaProducts ?? [0, 0, 0];
  const determinant = a * b * c + 2 * d * e * f - a * f * f - b * e * e - c * d * d;
  if (!(determinant > 0) || !Number.isFinite(determinant)) throw new Error(`${body.binding.objectId}: inertia tensor must be positive definite and finite.`);
  return [b * c - f * f, a * c - e * e, a * b - d * d, e * f - c * d, d * f - b * e, d * e - a * f].map((value) => value / determinant);
}
