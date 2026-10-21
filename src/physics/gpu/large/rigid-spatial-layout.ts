import type { RigidWorldDescriptor } from "../../runtime/rigid-world-descriptor";
import { RIGID_LAYOUT } from "../rigid-layout";

export const LARGE_RIGID = { neighbors: 16, nodeBytes: 32, sweeps: 12 } as const;

/** Initial topology is built once from authored positions; every refit runs on the GPU. */
export function createRigidSpatialLayout(world: RigidWorldDescriptor, limits: GPUSupportedLimits) {
  const count = world.bodies.length;
  const leaves = 2 ** Math.ceil(Math.log2(Math.max(1, count)));
  const manifoldBytes = count * LARGE_RIGID.neighbors * RIGID_LAYOUT.manifoldBytes;
  const treeBytes = 2 * leaves * LARGE_RIGID.nodeBytes;
  if (!count || Math.max(manifoldBytes, treeBytes) > Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize)
    || limits.maxStorageBuffersPerShaderStage < 8 || Math.ceil(count / 64) > limits.maxComputeWorkgroupsPerDimension) {
    throw new Error(`Physics world exceeds this device's storage/dispatch capacity (${count} bodies, ${manifoldBytes} contact bytes per bank).`);
  }
  const nodes = new ArrayBuffer(treeBytes);
  const integers = new Uint32Array(nodes);
  const indices = world.bodies.map((_, index) => index);
  // Balanced spatial median partition; topology remains valid as bodies move.
  const partition = (start: number, end: number, depth: number): void => {
    if (end - start < 2) return;
    const axis = depth % 3;
    const sorted = indices.slice(start, end).sort((a, b) => world.bodies[a].position[axis] - world.bodies[b].position[axis] || a - b);
    for (let i = 0; i < sorted.length; i++) indices[start + i] = sorted[i];
    const middle = start + 2 ** Math.floor(Math.log2(end - start - 1));
    partition(start, middle, depth + 1); partition(middle, end, depth + 1);
  };
  partition(0, count, 0);
  for (let leaf = 0; leaf < leaves; leaf++) integers[(leaves + leaf) * 8 + 3] = indices[leaf] ?? 0xffffffff;
  return { count, leaves, manifoldBytes, treeBytes, nodes };
}
