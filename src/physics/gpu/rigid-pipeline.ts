import { rigidTriangleContactsWgsl } from "./shaders/rigid-triangle-contacts";
import { rigidCompoundContactsWgsl } from "./shaders/rigid-compound-contacts";
import { rigidJointsWgsl } from "./shaders/rigid-joints";
import { rigidEventsWgsl } from "./shaders/rigid-events";
import { rigidCapsuleContactsWgsl } from "./shaders/rigid-capsule-contacts";
import { rigidCommonWgsl } from "./shaders/rigid-common";
import { rigidSphereContactsWgsl } from "./shaders/rigid-sphere-contacts";
import { rigidBoxContactsWgsl } from "./shaders/rigid-box-contacts";
import { rigidManifoldsWgsl } from "./shaders/rigid-manifolds";
import { rigidContactSolverWgsl } from "./shaders/rigid-contact-solver";
import { rigidStepWgsl } from "./shaders/rigid-step";

const pipelines = new WeakMap<GPUDevice, Promise<GPUComputePipeline>>();

/** Compile once per owned device; the playback lane admits preparation. */
export function prepareRigidPipeline(device: GPUDevice): Promise<GPUComputePipeline> {
  const existing = pipelines.get(device);
  if (existing) return existing;
  const module = device.createShaderModule({
    label: "physics.impulse.smallWorld",
    code: [rigidCommonWgsl, rigidEventsWgsl, rigidSphereContactsWgsl, rigidBoxContactsWgsl,
      rigidTriangleContactsWgsl, rigidCapsuleContactsWgsl, rigidCompoundContactsWgsl, rigidManifoldsWgsl, rigidContactSolverWgsl, rigidJointsWgsl, rigidStepWgsl].join("\n"),
  });
  const pending = device.createComputePipelineAsync({
    label: "physics.impulse.smallWorld.step",
    layout: "auto",
    compute: { module, entryPoint: "step" },
  }).catch((error: unknown) => {
    pipelines.delete(device);
    throw error;
  });
  pipelines.set(device, pending);
  return pending;
}
