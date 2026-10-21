import type { CompiledPhysicsBody } from "../runtime/contracts";
import type { RigidBodyDescriptor } from "../runtime/rigid-world-descriptor";
import type { PhysicsVec3 as Vec } from "../domain/components";
import { rotate } from "../runtime/queries/static-shape-query";

/** Static triangles share the scene BVH, so concave surfaces retain holes and overhangs. */
export function compileStaticMesh(body: CompiledPhysicsBody): RigidBodyDescriptor[] {
  if (body.bodyType !== "static") throw new Error("Triangle meshes must be static; use primitive compounds for moving concave objects.");
  const geometry = body.collider.geometry;
  if (!geometry || !geometry.vertices.length || geometry.vertices.length % 3 || !geometry.indices.length || geometry.indices.length % 3
    || !geometry.vertices.every(Number.isFinite) || !geometry.indices.every((index) => Number.isInteger(index) && index >= 0 && index < geometry.vertices.length / 3)) {
    throw new Error("Mesh geometry requires finite XYZ vertices and valid triangle indices.");
  }
  const result: RigidBodyDescriptor[] = [];
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const points = geometry.indices.slice(i, i + 3).map((index) => geometry.vertices.slice(index * 3, index * 3 + 3).map((v, axis) => v * body.worldScale[axis]) as Vec);
    const ab = points[1].map((v, axis) => v - points[0][axis]), ac = points[2].map((v, axis) => v - points[0][axis]);
    if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) < 1e-10) continue;
    const center = [0, 1, 2].map((axis) => points.reduce((sum, p) => sum + p[axis] / 3, 0)) as Vec;
    const vertices = points.map((point) => point.map((v, axis) => v - center[axis]) as Vec) as [Vec, Vec, Vec];
    const shift = rotate(center, body.orientation);
    result.push({ binding: { objectId: body.objectId, colliderId: `${body.colliderId}:triangle:${i / 3}`, bodyType: "static", writesObjectPose: false,
      interpolation: "none", objectLocalOffset: [0, 0, 0], objectLocalOrientation: [0, 0, 0, 1], objectPosition: [...body.objectPosition], objectOrientation: [...body.objectOrientation] },
    position: body.position.map((v, axis) => v + shift[axis]) as Vec, orientation: [...body.orientation],
    shape: { kind: "triangle", vertices, radius: Math.max(...vertices.map((v) => Math.hypot(...v))) },
    mass: 0, inertia: [0, 0, 0], gravityScale: 0, linearDamping: 0, angularDamping: 0,
    friction: body.collider.friction, restitution: body.collider.restitution, collisionLayer: body.collider.collisionLayer,
    collisionMask: body.collider.collisionMask, isTrigger: body.collider.isTrigger });
  }
  if (!result.length) throw new Error("Mesh has no nondegenerate triangles.");
  return result;
}
