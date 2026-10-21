import { packRigidBodies } from "./rigid-body-upload";
import { RIGID_LAYOUT as L } from "./rigid-layout";
import { emptyRigidBody, type RigidBodyReplacement, type RigidBodySlotPort } from "../runtime/rigid-body-slots";
import type { RigidWorldDescriptor } from "../runtime/rigid-world-descriptor";
import type { createRigidBodyCommands } from "./rigid-body-commands";
import { assertRuntimeSlotBody } from "./runtime-slot-body-policy";

type Upload = ReturnType<typeof packRigidBodies> & { velocity: readonly [number, number, number]; active: boolean };

/** Sparse slot writes only. Existing GPU poses, velocities, forces and contacts stay resident. */
export function createRigidSlotUpload(device: GPUDevice, world: RigidWorldDescriptor,
  position: GPUBuffer, orientation: GPUBuffer, properties: GPUBuffer, velocities: GPUBuffer[],
  commands: ReturnType<typeof createRigidBodyCommands>) {
  const start = world.runtimeBodyStart ?? world.bodies.length, capacity = world.bodies.length - start;
  const generations = new Uint32Array(world.bodies.length), alive = new Uint8Array(world.bodies.length);
  alive.fill(1, 0, start);
  const pending = new Map<number, Upload>();
  let activeCount = start, disposed = false;
  const port: RigidBodySlotPort = {
    start, capacity, activeCount: () => activeCount,
    generation: (index) => alive[index] ? generations[index] : -1,
    prepare(changes: readonly RigidBodyReplacement[]) {
      if (disposed) throw new Error("Rigid slot world has ended.");
      if (changes.length > 128) throw new Error("A rigid structural batch is limited to 128 changes.");
      const seen = new Set<number>();
      const staged = changes.map((change) => {
        const offset = change.index;
        if (!Number.isInteger(offset) || offset < 0 || offset >= alive.length || seen.has(offset)) throw new Error("Invalid or repeated rigid slot.");
        seen.add(offset);
        if (change.body && offset < start) throw new Error("Authored rigid slots may only be removed; they cannot be replaced or reused during Play.");
        if (change.body && (alive[offset] || generations[offset] === 0xffffffff)) throw new Error("Rigid slot is active or its generation is exhausted.");
        if (!change.body && !alive[offset]) throw new Error("Cannot remove an inactive rigid slot.");
        const next = structuredClone(change.body ?? emptyRigidBody(change.index));
        if (change.body) assertRuntimeSlotBody(next);
        const upload = packRigidBodies({ ...world, bodies: [next], joints: [] });
        const generation = generations[offset] + Number(Boolean(change.body));
        // force.w is an opaque generation lane; force/torque writes preserve it.
        new Uint32Array(upload.properties.buffer)[23] = generation;
        const velocity = change.velocity ?? [0, 0, 0];
        if (velocity.length !== 3 || !velocity.every((v) => Number.isFinite(v) && Number.isFinite(Math.fround(v)))) throw new Error("Initial velocity must be a finite 3D vector.");
        return { index: change.index, offset, next, generation, active: Boolean(change.body),
          upload: { ...upload, velocity: [...velocity] as [number, number, number], active: Boolean(change.body) },
          old: world.bodies[change.index], oldGeneration: generations[offset], oldAlive: alive[offset], oldPending: pending.get(change.index) };
      });
      let published = false;
      return {
        publish() {
          if (disposed || published) throw new Error("Rigid slot transaction is no longer publishable.");
          if (staged.some((item) => world.bodies[item.index] !== item.old || generations[item.offset] !== item.oldGeneration || alive[item.offset] !== item.oldAlive)) throw new Error("Rigid slots changed after preparation.");
          published = true;
          for (const item of staged) {
            world.bodies[item.index] = item.next; generations[item.offset] = item.generation; alive[item.offset] = Number(item.active);
            activeCount += Number(item.active) - item.oldAlive; pending.set(item.index, item.upload);
          }
        },
        rollback() {
          if (!published) return;
          for (const item of staged) {
            world.bodies[item.index] = item.old; generations[item.offset] = item.oldGeneration; alive[item.offset] = item.oldAlive;
            activeCount -= Number(item.active) - item.oldAlive;
            if (item.oldPending) pending.set(item.index, item.oldPending); else pending.delete(item.index);
          }
          published = false;
        },
      };
    },
  };
  return {
    port,
    dispose() { disposed = true; pending.clear(); },
    upload() {
      for (const [index, data] of pending) {
        commands.reset(index, !data.active);
        device.queue.writeBuffer(position, index * L.poseBytes, data.initialPositions);
        device.queue.writeBuffer(orientation, index * L.poseBytes, data.initialOrientations);
        device.queue.writeBuffer(properties, index * L.propertyBytes, data.properties);
        const velocity = new Float32Array([...data.velocity, 0, 0, 0, 0, 0]);
        for (const buffer of velocities) device.queue.writeBuffer(buffer, index * L.velocityBytes, velocity);
      }
      pending.clear();
    },
  };
}
