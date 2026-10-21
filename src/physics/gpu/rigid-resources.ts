import { createRigidBodyCommands } from "./rigid-body-commands";
import { packRigidBodies } from "./rigid-body-upload";
import type { RigidWorldDescriptor } from "../runtime/rigid-world-descriptor";
import { RIGID_LAYOUT as L } from "./rigid-layout";
import { createRigidEvents } from "./rigid-events";
import { createRigidSlotUpload } from "./rigid-slot-upload";

/** Cold packing/allocation boundary; no allocations or CPU body scans during ticks. */
export function createRigidResources(device: GPUDevice, world: RigidWorldDescriptor, pipeline: GPUComputePipeline, commandsPipeline: GPUComputePipeline) {
  const count = world.bodies.length;
  const maxPairs = Math.max(1, count * (count - 1) / 2);
  const contactBytes = maxPairs * L.manifoldBytes;
  if (count < 1 || count > L.smallWorldThreshold) throw new Error(`Rigid small-world capacity is 1–${L.smallWorldThreshold} bodies.`);
  if (device.limits.maxComputeInvocationsPerWorkgroup < L.workgroupSize
    || device.limits.maxComputeWorkgroupSizeX < L.workgroupSize
    || device.limits.maxComputeWorkgroupStorageSize < L.smallWorldThreshold * 4 * L.poseBytes
    || device.limits.maxStorageBuffersPerShaderStage < 6
    || device.limits.maxStorageBufferBindingSize < contactBytes
    || device.limits.maxBufferSize < contactBytes) {
    throw new Error(`The WebGPU device cannot allocate the rigid small-world layout (${count} bodies, ${contactBytes} contact bytes).`);
  }
  const { initialPositions, initialOrientations, properties } = packRigidBodies(world);
  const uniform = new ArrayBuffer(L.uniformBytes);
  new Uint32Array(uniform, 0, 4).set([count, count + count % 2, L.substeps, L.solveSweeps]);
  new Float32Array(uniform, 16, 4).set([...world.gravity, 0]);
  new Float32Array(uniform, 32, 4).set([world.fixedTimestep, 60, 1, 0.001]);
  if (properties.byteLength > device.limits.maxStorageBufferBindingSize || properties.byteLength > device.limits.maxBufferSize) throw new Error("Rigid body/compound properties exceed device storage limits.");
  const owned: GPUBuffer[] = [];
  const allocate = (label: string, size: number, usage: GPUBufferUsageFlags, data?: ArrayBufferLike) => {
    const buffer = device.createBuffer({ label: `physics.impulse.${label}`, size, usage, mappedAtCreation: !!data });
    owned.push(buffer);
    if (data) {
      new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data));
      buffer.unmap();
    }
    return buffer;
  };
  let commands: ReturnType<typeof createRigidBodyCommands> | undefined;
  let events: ReturnType<typeof createRigidEvents> | undefined;
  let slots: ReturnType<typeof createRigidSlotUpload> | undefined;
  const destroy = () => { slots?.dispose(); commands?.destroy(); events?.destroy(); for (const buffer of owned) buffer.destroy(); owned.length = 0; };
  try {
    const params = allocate("params", L.uniformBytes, GPUBufferUsage.UNIFORM, uniform);
    const props = allocate("properties", properties.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, properties.buffer);
    const position = allocate("positions", initialPositions.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, initialPositions.buffer);
    const orientation = allocate("orientations", initialOrientations.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, initialOrientations.buffer);
    const velocity = allocate("velocities", count * L.velocityBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const contacts = allocate("manifolds", contactBytes, GPUBufferUsage.STORAGE);
    events = createRigidEvents(device, count);
    const bindGroup = device.createBindGroup({
      label: "physics.impulse.world",
      layout: pipeline.getBindGroupLayout(0),
      entries: [params, props, position, orientation, velocity, contacts, events.buffer].map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    commands = createRigidBodyCommands(device, world, commandsPipeline, position, orientation, props, [velocity]);
    slots = createRigidSlotUpload(device, world, position, orientation, props, [velocity], commands);
    return { bodySlots: slots.port, readEvents: events.read, queueBodyCommand: commands.queue, position, orientation, bindGroup, initialPositions, initialOrientations,
      capacity: { bodyCount: count, maxPairs, maxManifolds: maxPairs }, destroy,
      encode(encoder: GPUCommandEncoder, ticks: number) {
        slots!.upload(); commands!.upload();
        for (let tick = 0; tick < ticks; tick++) {
          commands!.encode(encoder);
          const pass = encoder.beginComputePass({ label: "physics.impulse.smallWorld" });
          pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(1); pass.end();
        }
      } };
  } catch (error) {
    destroy();
    throw error;
  }
}
