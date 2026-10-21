import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { createStaticQueryWorld, type StaticSweep } from "../../physics/runtime/queries/static-query-world";
import type { PhysicsWorldSettings, SceneObject } from "../../types";

export function createStaticSceneQueryCache() {
  let previous: SceneObject[] | undefined, settings: PhysicsWorldSettings | undefined;
  let world: ReturnType<typeof createStaticQueryWorld> | undefined;
  return (objects: SceneObject[], physics: PhysicsWorldSettings, request: Record<string, unknown>) => {
    if (request.scope !== "static") throw new Error("Immediate queries require scope: static; dynamic GPU queries are not available.");
    if (request.kind !== "raycast" && request.kind !== "sphere-cast" && request.kind !== "capsule-cast") throw new Error("Expected raycast, sphere-cast or capsule-cast.");
    if (!Array.isArray(request.origin) || !Array.isArray(request.direction) || typeof request.maxDistance !== "number") throw new Error("Expected origin, direction and maxDistance.");
    if (request.radius !== undefined && typeof request.radius !== "number") throw new Error("radius must be a number.");
    if (request.includeTriggers !== undefined && typeof request.includeTriggers !== "boolean") throw new Error("includeTriggers must be boolean.");
    for (const key of ["collisionLayer", "collisionMask"]) if (request[key] !== undefined && typeof request[key] !== "number") throw new Error(`${key} must be a number.`);
    if (objects !== previous || settings !== physics || !world) {
      const compiled = compileAuthoredPhysicsScene(objects, "static-queries", physics);
      compiled.joints = [];
      compiled.bodies = compiled.bodies.filter((body) => body.bodyType === "static");
      world = createStaticQueryWorld(compileRigidWorld(compiled)); previous = objects; settings = physics;
    }
    const query = { origin: request.origin, direction: request.direction, maxDistance: request.maxDistance, radius: request.radius,
      collisionLayer: request.collisionLayer, collisionMask: request.collisionMask,
      includeTriggers: request.includeTriggers,
      excludeObjectId: typeof request.excludeObjectId === "string" ? request.excludeObjectId : undefined } as StaticSweep;
    if (request.kind === "capsule-cast") {
      if (!Array.isArray(request.halfSegment) || typeof request.radius !== "number") throw new Error("Capsule cast requires halfSegment and radius.");
      return { scope: "static", bodyCount: world.bodyCount, hit: world.capsuleCast({ ...query, radius: request.radius, halfSegment: request.halfSegment as [number, number, number] }) };
    }
    return { scope: "static", bodyCount: world.bodyCount, hit: request.kind === "raycast" ? world.raycast(query) : world.sphereCast(query) };
  };
}
