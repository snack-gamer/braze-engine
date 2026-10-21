import { largeTreeWgsl } from "./rigid-large-shaders";
import { largeContactsWgsl } from "./rigid-large-contacts";
import { largeSolveWgsl } from "./rigid-large-solve";

export const LARGE_STAGES = {
  tick: [5],
  leaves: [0, 1, 2, 3, 4, 9], refit: [4, 8], contacts: [0, 1, 2, 3, 4, 5, 6, 7, 9],
  forces: [0, 1, 3, 5, 9, 10], solve: [0, 1, 2, 3, 5, 6, 8, 9, 10], integrate: [0, 1, 2, 3, 5, 9],
} as const;
export type LargeStage = keyof typeof LARGE_STAGES;
export type LargeRigidPipelines = Record<LargeStage, GPUComputePipeline>;
const cache = new WeakMap<GPUDevice, Promise<LargeRigidPipelines>>();

export function prepareLargeRigidPipelines(device: GPUDevice): Promise<LargeRigidPipelines> {
  const existing = cache.get(device); if (existing) return existing;
  const tree = device.createShaderModule({ label: "physics.spatialTree", code: largeTreeWgsl });
  const contacts = device.createShaderModule({ label: "physics.spatialContacts", code: largeContactsWgsl });
  const solver = device.createShaderModule({ label: "physics.parallelImpulse", code: largeSolveWgsl });
  const pending = Promise.all((Object.keys(LARGE_STAGES) as LargeStage[]).map(async (stage) => [stage,
    await device.createComputePipelineAsync({ label: `physics.large.${stage}`, layout: "auto",
      compute: { module: stage === "contacts" ? contacts : stage === "leaves" || stage === "refit" || stage === "tick" ? tree : solver, entryPoint: stage } }),
  ])).then((entries) => Object.fromEntries(entries) as LargeRigidPipelines).catch((error: unknown) => {
    cache.delete(device); throw error;
  });
  cache.set(device, pending); return pending;
}
