import { createRigidBodyCommands } from "../rigid-body-commands";
import type { RigidWorldDescriptor } from "../../runtime/rigid-world-descriptor";
import type { RigidRuntimeResources } from "../rigid-runtime-resources";
import { packRigidBodies } from "../rigid-body-upload";
import { RIGID_LAYOUT as L } from "../rigid-layout";
import { createRigidSpatialLayout, LARGE_RIGID } from "./rigid-spatial-layout";
import { LARGE_STAGES, type LargeStage, type LargeRigidPipelines } from "./rigid-large-pipeline";
import { createRigidCapacityDiagnostics } from "./rigid-capacity-diagnostics";
import { createRigidEvents } from "../rigid-events";
import { createRigidSlotUpload } from "../rigid-slot-upload";

export function createLargeRigidResources(device: GPUDevice, world: RigidWorldDescriptor, pipelines: LargeRigidPipelines, commandsPipeline: GPUComputePipeline): RigidRuntimeResources {
  const layout = createRigidSpatialLayout(world, device.limits);
  const upload = packRigidBodies(world);
  if (upload.properties.byteLength > device.limits.maxStorageBufferBindingSize || upload.properties.byteLength > device.limits.maxBufferSize) throw new Error("Rigid body/compound properties exceed device storage limits.");
  const owned: GPUBuffer[] = [];
  const allocate = (label: string, size: number, usage: GPUBufferUsageFlags, data?: ArrayBufferLike) => {
    const buffer = device.createBuffer({ label: `physics.large.${label}`, size, usage, mappedAtCreation: !!data });
    owned.push(buffer);
    if (data) { new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data)); buffer.unmap(); }
    return buffer;
  };
  let commands: ReturnType<typeof createRigidBodyCommands> | undefined;
  let diagnostics: ReturnType<typeof createRigidCapacityDiagnostics> | undefined;
  let events: ReturnType<typeof createRigidEvents> | undefined;
  let slots: ReturnType<typeof createRigidSlotUpload> | undefined;
  const destroy = () => { slots?.dispose(); commands?.destroy(); diagnostics?.destroy(); events?.destroy(); for (const buffer of owned) buffer.destroy(); owned.length = 0; };
  try {
    const uniform = new ArrayBuffer(L.uniformBytes);
    new Uint32Array(uniform, 0, 4).set([layout.count, layout.leaves, L.substeps, LARGE_RIGID.sweeps]);
    new Float32Array(uniform, 16, 4).set([...world.gravity, 0]);
    new Float32Array(uniform, 32, 4).set([world.fixedTimestep, 60, 1, 0.001]);
    const params = allocate("params", L.uniformBytes, GPUBufferUsage.UNIFORM, uniform);
    const properties = allocate("properties", upload.properties.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, upload.properties.buffer);
    const position = allocate("position", upload.initialPositions.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, upload.initialPositions.buffer);
    const orientation = allocate("orientation", upload.initialOrientations.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, upload.initialOrientations.buffer);
    const tree = allocate("tree", layout.treeBytes, GPUBufferUsage.STORAGE, layout.nodes);
    events = createRigidEvents(device, layout.count);
    const status = events.buffer;
    const manifolds = [0, 1].map((bank) => allocate(`contacts${bank}`, layout.manifoldBytes, GPUBufferUsage.STORAGE));
    const velocity = [0, 1].map((bank) => allocate(`velocity${bank}`, layout.count * L.velocityBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST));
    const stages = new Map<number, GPUBuffer>();
    for (const start of new Set([0, 1, 2, ...Array.from({ length: Math.log2(layout.leaves) }, (_, i) => 2 ** i)])) {
      stages.set(start, allocate(`stage${start}`, 16, GPUBufferUsage.UNIFORM, new Uint32Array([start, 0, 0, 0]).buffer));
    }
    const groups = new Map<string, GPUBindGroup>();
    // Bind groups are compiled only at world creation, never inside the frame loop.
    for (const stage of Object.keys(LARGE_STAGES) as LargeStage[]) {
      for (const start of stage === "refit" ? [...stages.keys()].filter((value) => value > 0) : stage === "solve" ? [0, 1, 2] : [0]) {
        for (let contactBank = 0; contactBank < 2; contactBank++) for (let velocityBank = 0; velocityBank < 2; velocityBank++) {
          const buffers = [params, properties, position, orientation, tree, status, manifolds[contactBank], manifolds[1 - contactBank], stages.get(start)!, velocity[velocityBank], velocity[1 - velocityBank]];
          groups.set(`${stage}:${start}:${contactBank}:${velocityBank}`, device.createBindGroup({
            layout: pipelines[stage].getBindGroupLayout(0),
            entries: LARGE_STAGES[stage].map((binding) => ({ binding, resource: { buffer: buffers[binding] } })),
          }));
        }
      }
    }
    commands = createRigidBodyCommands(device, world, commandsPipeline, position, orientation, properties, velocity);
    slots = createRigidSlotUpload(device, world, position, orientation, properties, velocity, commands);
    diagnostics = createRigidCapacityDiagnostics(device, status);
    let contactBank = 0; let velocityBank = 0;
    return {
      bodySlots: slots.port,
      readEvents: events.read,
      queueBodyCommand: commands.queue, position, orientation, initialPositions: upload.initialPositions, initialOrientations: upload.initialOrientations,
      capacity: { bodyCount: layout.count, maxPairs: layout.count * LARGE_RIGID.neighbors, maxManifolds: layout.count * LARGE_RIGID.neighbors },
      destroy, checkHealth: diagnostics.checkHealth, afterSubmit: diagnostics.afterSubmit,
      encode(encoder, ticks) {
        slots!.upload(); commands!.upload();
        let pass: GPUComputePassEncoder;
        const dispatch = (stage: LargeStage, count: number, start = 0) => {
          pass.setPipeline(pipelines[stage]); pass.setBindGroup(0, groups.get(`${stage}:${start}:${contactBank}:${velocityBank}`)!);
          pass.dispatchWorkgroups(Math.ceil(count / 64));
        };
        const solve = (mode: number) => { dispatch("solve", layout.count, mode); velocityBank = 1 - velocityBank; };
        for (let tick = 0; tick < ticks; tick++) {
          commands!.encode(encoder, velocityBank);
          pass = encoder.beginComputePass({ label: "physics.large.fixedTick" });
          dispatch("tick", 1);
          for (let substep = 0; substep < L.substeps; substep++) {
          dispatch("leaves", layout.leaves);
          for (let start = layout.leaves / 2; start >= 1; start /= 2) dispatch("refit", start, start);
          dispatch("contacts", layout.count);
          dispatch("forces", layout.count); velocityBank = 1 - velocityBank;
          solve(0);
          for (let sweep = 0; sweep < LARGE_RIGID.sweeps; sweep++) solve(1);
          dispatch("integrate", layout.count);
          for (let sweep = 0; sweep < L.relaxationSweeps; sweep++) solve(2);
          contactBank = 1 - contactBank;
        }
          pass.end();
        }
        diagnostics!.encode(encoder);
      },
    };
  } catch (error) { destroy(); throw error; }
}
