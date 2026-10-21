import type { RigidBodyDescriptor, RigidWorldDescriptor } from "./rigid-world-descriptor";

export type RigidBodyReplacement = Readonly<{ index: number; body: RigidBodyDescriptor | null; velocity?: readonly [number, number, number] }>;
export type RigidBodySlotPort = Readonly<{
  start: number;
  capacity: number;
  activeCount: () => number;
  generation: (index: number) => number;
  prepare: (changes: readonly RigidBodyReplacement[]) => Readonly<{ publish: () => void; rollback: () => void }>;
}>;

/** Inactive collider slots participate in the same solver allocation, never another world. */
export function emptyRigidBody(index: number): RigidBodyDescriptor {
  return {
    binding: { objectId: `@reserved:${index}`, colliderId: "", writesObjectPose: false, interpolation: "none", bodyType: "static",
      objectPosition: [0, 0, 0], objectOrientation: [0, 0, 0, 1], objectLocalOffset: [0, 0, 0], objectLocalOrientation: [0, 0, 0, 1] },
    shape: { kind: "sphere", radius: 0 }, position: [0, 0, 0], orientation: [0, 0, 0, 1], mass: 0, inertia: [0, 0, 0],
    gravityScale: 0, linearDamping: 0, angularDamping: 0, friction: 0, collisionMask: 0,
  };
}
export function reserveRigidBodySlots(world: RigidWorldDescriptor, count: number): RigidWorldDescriptor {
  if (!Number.isInteger(count) || count < 0 || count > 4096) throw new Error("Runtime physics reserve must be 0–4096 bodies.");
  if (!count) return world;
  const start = world.bodies.length;
  return { ...world, runtimeBodyStart: start, bodies: [...world.bodies, ...Array.from({ length: count }, (_, i) => emptyRigidBody(start + i))] };
}
