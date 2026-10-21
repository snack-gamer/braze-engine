import { closestTrianglePoint } from "./triangle-distance";
import type { RigidBodyDescriptor } from "../rigid-world-descriptor";
import type { PhysicsVec3 as Vec } from "../../domain/components";

export type ShapeHit = { distance: number; point: Vec; normal: Vec; penetration: number };
export function rotate(vector: Vec, q: readonly number[]): Vec {
  const [x, y, z] = vector, [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}
function localPoint(body: RigidBodyDescriptor, point: Vec): Vec {
  const q = body.orientation;
  return rotate(point.map((v, i) => v - body.position[i]) as Vec, [-q[0], -q[1], -q[2], q[3]]);
}
function signedDistance(body: RigidBodyDescriptor, worldPoint: Vec): { distance: number; normal: Vec } {
  const point = localPoint(body, worldPoint), shape = body.shape;
  if (shape.kind === "compound") throw new Error("Static query proxies must be primitive colliders.");
  let normal: Vec, distance: number;
  if (shape.kind === "triangle") {
    const closest = closestTrianglePoint(point, ...shape.vertices);
    const delta = point.map((v, i) => v - closest[i]) as Vec; distance = Math.hypot(...delta);
    const [a, b, c] = shape.vertices, ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const cross: Vec = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    normal = distance > 1e-12 ? delta.map((v) => v / distance) as Vec : cross.map((v) => v / Math.hypot(...cross)) as Vec;
  } else if (shape.kind === "box") {
    const offset = point.map((value, i) => Math.abs(value) - shape.halfExtents[i]) as Vec;
    const outside = offset.map((value) => Math.max(0, value)) as Vec;
    const length = Math.hypot(...outside);
    if (length > 1e-12) { normal = outside.map((value, i) => value / length * (point[i] < 0 ? -1 : 1)) as Vec; distance = length; }
    else {
      const axis = offset.indexOf(Math.max(...offset)); normal = [0, 0, 0]; normal[axis] = point[axis] < 0 ? -1 : 1; distance = offset[axis];
    }
  } else {
    const delta: Vec = [...point];
    if (shape.kind === "capsule") delta[1] -= Math.max(-shape.halfLength, Math.min(shape.halfLength, point[1]));
    const length = Math.hypot(...delta); normal = length > 1e-12 ? delta.map((v) => v / length) as Vec : [1, 0, 0];
    distance = length - shape.radius;
  }
  return { distance, normal: rotate(normal, body.orientation) };
}

/** Conservative advancement on exact primitive signed distances; static geometry only. */
export function sweepStaticShape(body: RigidBodyDescriptor, origin: Vec, direction: Vec, maxDistance: number, radius: number, halfSegment: Vec = [0, 0, 0], ignoreSeparating = false): ShapeHit | null {
  let travel = 0;
  for (let iteration = 0; iteration < 64; iteration++) {
    const center = origin.map((v, i) => v + direction[i] * travel) as Vec;
    const sample = segmentDistance(body, center, halfSegment); const gap = sample.distance - radius;
    const closing = -sample.normal.reduce((sum, value, i) => sum + value * direction[i], 0);
    if (gap <= 1e-5) {
      if (ignoreSeparating && travel === 0 && gap >= -1e-5 && closing <= 1e-10) return null;
      return { distance: travel, point: sample.center.map((v, i) => v - sample.normal[i] * radius) as Vec, normal: sample.normal, penetration: Math.max(0, -gap) };
    }
    if (closing <= 1e-10) return null;
    // Convex distance lies above its tangent: advancing to the tangent zero is safe.
    travel += gap / closing;
    if (travel > maxDistance) return null;
  }
  throw new Error("Static shape sweep did not converge; shorten the query or increase clearance.");
}

/** Minimize the convex primitive distance along a capsule's central segment. */
function segmentDistance(body: RigidBodyDescriptor, center: Vec, halfSegment: Vec) {
  const sample = (t: number) => {
    const point = center.map((v, i) => v + halfSegment[i] * t) as Vec;
    return { ...signedDistance(body, point), center: point };
  };
  if (Math.hypot(...halfSegment) < 1e-12) return sample(0);
  let low = -1, high = 1;
  // A bounded convex search also covers rotated boxes and arbitrary static capsule axes.
  for (let i = 0; i < 56; i++) {
    const a = low + (high - low) / 3, b = high - (high - low) / 3;
    if (sample(a).distance <= sample(b).distance) high = b; else low = a;
  }
  return [sample(-1), sample(1), sample((low + high) / 2)].reduce((a, b) => a.distance <= b.distance ? a : b);
}

export function staticBodyBounds(body: RigidBodyDescriptor): { low: Vec; high: Vec } {
  const shape = body.shape; let extent: Vec;
  if (shape.kind === "compound") throw new Error("Static query proxies must be primitive colliders.");
  if (shape.kind === "triangle") {
    const points = shape.vertices.map((v) => rotate(v, body.orientation).map((x, i) => x + body.position[i]));
    return { low: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec, high: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec };
  }
  if (shape.kind === "sphere") extent = [shape.radius, shape.radius, shape.radius];
  else if (shape.kind === "capsule") extent = rotate([0, shape.halfLength, 0], body.orientation).map((v) => Math.abs(v) + shape.radius) as Vec;
  else {
    const axes = [rotate([1, 0, 0], body.orientation), rotate([0, 1, 0], body.orientation), rotate([0, 0, 1], body.orientation)];
    extent = [0, 1, 2].map((i) => axes.reduce((sum, axis, j) => sum + Math.abs(axis[i]) * shape.halfExtents[j], 0)) as Vec;
  }
  return { low: body.position.map((v, i) => v - extent[i]) as Vec, high: body.position.map((v, i) => v + extent[i]) as Vec };
}
