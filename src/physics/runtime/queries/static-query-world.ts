import type { RigidWorldDescriptor } from "../rigid-world-descriptor";
import type { PhysicsVec3 as Vec } from "../../domain/components";
import { staticBodyBounds, sweepStaticShape, type ShapeHit } from "./static-shape-query";
import { collisionLayersMatch } from "../../domain/collision-material";

export type StaticQueryHit = ShapeHit & { objectId: string; colliderId: string; scope: "static" };
export type StaticSweep = { origin: Vec; direction: Vec; maxDistance: number; radius?: number; excludeObjectId?: string; collisionLayer?: number; collisionMask?: number; includeTriggers?: boolean };
export type StaticCapsuleSweep = StaticSweep & { radius: number; halfSegment: Vec; ignoreInitialSeparating?: boolean };

/** Cold-built static BVH. It never copies or guesses moving GPU body poses. */
export function createStaticQueryWorld(world: RigidWorldDescriptor, isActive: (objectId: string) => boolean = () => true) {
  const bodies = world.bodies.filter((body) => body.binding.bodyType === "static");
  const bounds = bodies.map(staticBodyBounds);
  const capacity = Math.max(1, bodies.length * 2);
  const low = new Float64Array(capacity * 3), high = new Float64Array(capacity * 3);
  const children = new Int32Array(capacity * 2).fill(-1), bodyIndices = new Int32Array(capacity).fill(-1);
  let used = 0;
  function build(indices: number[]): number {
    const node = used++;
    for (let axis = 0; axis < 3; axis++) {
      low[node * 3 + axis] = indices.reduce((min, i) => Math.min(min, bounds[i].low[axis]), Infinity);
      high[node * 3 + axis] = indices.reduce((max, i) => Math.max(max, bounds[i].high[axis]), -Infinity);
    }
    if (indices.length === 1) bodyIndices[node] = indices[0];
    else {
      const spans = [0, 1, 2].map((axis) => high[node * 3 + axis] - low[node * 3 + axis]);
      const axis = spans.indexOf(Math.max(...spans)); indices.sort((a, b) => bodies[a].position[axis] - bodies[b].position[axis]);
      const split = Math.floor(indices.length / 2);
      children[node * 2] = build(indices.slice(0, split)); children[node * 2 + 1] = build(indices.slice(split));
    }
    return node;
  }
  if (bodies.length) build(bodies.map((_, i) => i));
  function cast(query: StaticSweep, halfSegment: Vec = [0, 0, 0], ignoreSeparating = false): StaticQueryHit | null {
    const radius = query.radius ?? 0;
    if (query.origin.length !== 3 || query.direction.length !== 3 || ![...query.origin, ...query.direction, query.maxDistance, radius].every(Number.isFinite) || query.maxDistance < 0 || radius < 0) throw new Error("Queries require finite vectors and nonnegative distance/radius.");
    if (halfSegment.length !== 3 || !halfSegment.every(Number.isFinite)) throw new Error("Capsule halfSegment requires three finite numbers.");
    if (query.collisionLayer !== undefined && (!Number.isInteger(query.collisionLayer) || query.collisionLayer < 0 || query.collisionLayer > 31)
      || query.collisionMask !== undefined && (!Number.isInteger(query.collisionMask) || query.collisionMask < 0 || query.collisionMask > 0xffffffff)) throw new Error("Queries require a layer from 0 to 31 and a uint32 collision mask.");
    const length = Math.hypot(...query.direction); if (length < 1e-12) throw new Error("Query direction cannot be zero.");
    const direction = query.direction.map((v) => v / length) as Vec;
    let best: StaticQueryHit | null = null;
    const stack = bodies.length ? [0] : [];
    while (stack.length) {
      const node = stack.pop()!; let near = 0, far = best?.distance ?? query.maxDistance;
      for (let axis = 0; axis < 3; axis++) {
        const extent = radius + Math.abs(halfSegment[axis]);
        const min = low[node * 3 + axis] - extent, max = high[node * 3 + axis] + extent;
        if (Math.abs(direction[axis]) < 1e-12) { if (query.origin[axis] < min || query.origin[axis] > max) { far = -1; break; } }
        else {
          const a = (min - query.origin[axis]) / direction[axis], b = (max - query.origin[axis]) / direction[axis];
          near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
      }
      if (far < near) continue;
      const index = bodyIndices[node];
      if (index < 0) { stack.push(children[node * 2], children[node * 2 + 1]); continue; }
      const body = bodies[index]; if (body.binding.objectId === query.excludeObjectId) continue;
      if (!isActive(body.binding.objectId)) continue;
      if (body.isTrigger && !query.includeTriggers) continue;
      if (!collisionLayersMatch(query, { ...body, collisionMask: query.collisionLayer === undefined ? 0xffffffff : body.collisionMask })) continue;
      const hit = sweepStaticShape(body, query.origin, direction, best?.distance ?? query.maxDistance, radius, halfSegment, ignoreSeparating);
      if (hit && (!best || hit.distance < best.distance || hit.distance === best.distance && hit.penetration > best.penetration)) best = { ...hit, objectId: body.binding.objectId, colliderId: body.binding.colliderId, scope: "static" };
    }
    return best;
  }
  return { bodyCount: bodies.length, raycast: (query: Omit<StaticSweep, "radius">) => cast({ ...query, radius: 0 }), sphereCast: (query: StaticSweep) => cast(query),
    capsuleCast: (query: StaticCapsuleSweep) => cast(query, query.halfSegment, query.ignoreInitialSeparating) };
}
