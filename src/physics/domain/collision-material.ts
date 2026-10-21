export type CollisionMaterial = { restitution?: number; collisionLayer?: number; collisionMask?: number; isTrigger?: boolean };
export const DEFAULT_COLLISION_MATERIAL = Object.freeze({ restitution: 0, collisionLayer: 0, collisionMask: 0xffffffff });

/** Both colliders must accept the other's layer. Layers are 0–31; masks are uint32. */
export function collisionLayersMatch(a: CollisionMaterial, b: CollisionMaterial): boolean {
  return ((a.collisionMask ?? 0xffffffff) & (1 << (b.collisionLayer ?? 0))) !== 0
    && ((b.collisionMask ?? 0xffffffff) & (1 << (a.collisionLayer ?? 0))) !== 0;
}
