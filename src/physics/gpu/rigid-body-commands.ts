import { RIGID_LAYOUT } from "./rigid-layout";
import { rigidPropertiesWgsl } from "./shaders/rigid-common";
import type { RigidWorldDescriptor } from "../runtime/rigid-world-descriptor";

export type RigidBodyCommand =
  | { kind: "impulse" | "velocity" | "force"; body: number; linear: readonly number[]; angular?: readonly number[] }
  | { kind: "kinematic-target"; body: number; position: readonly number[]; orientation: readonly number[] };
const STRIDE = 64;
const shader = rigidPropertiesWgsl + /* wgsl */`
struct Velocity { linear: vec4f, angular: vec4f }
struct Command { destination: vec4f, rotation: vec4f, linear: vec4f, angular: vec4f }
struct Params { dt: f32, count: u32, pad0: u32, pad1: u32 }
@group(0) @binding(0) var<storage, read_write> p: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> q: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> velocities: array<Velocity>;
@group(0) @binding(3) var<storage, read_write> commands: array<Command>;
@group(0) @binding(4) var<storage, read> properties: array<Properties>;
@group(0) @binding(5) var<uniform> params: Params;
fn rotate(r: vec4f, v: vec3f) -> vec3f { return v + 2.0 * cross(r.xyz, cross(r.xyz, v) + r.w * v); }
@compute @workgroup_size(64)
fn apply(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= params.count) { return; }
  let c = commands[i];
  if (p[i].w < 0.0) {
    velocities[i].linear = vec4f(0.0); velocities[i].angular = vec4f(0.0);
    if (c.destination.w > 0.5) {
      velocities[i].linear = vec4f((c.destination.xyz - p[i].xyz) / params.dt, 0.0);
      let old = q[i]; var destination = c.rotation;
      if (dot(old, destination) < 0.0) { destination = -destination; }
      let delta = vec4f(old.w * destination.xyz - destination.w * old.xyz - cross(destination.xyz, old.xyz), dot(destination, old));
      let sine = length(delta.xyz);
      if (sine > 1e-7) { velocities[i].angular = vec4f(delta.xyz * (2.0 * atan2(sine, delta.w) / (sine * params.dt)), 0.0); }
    }
  } else if (properties[i].inertia.w > 0.0) {
    if (c.linear.w == 1.0) {
      velocities[i].linear += vec4f(c.linear.xyz * properties[i].inertia.w, 0.0);
      let local = rotate(vec4f(-q[i].xyz, q[i].w), c.angular.xyz);
      let c = properties[i].inertiaCross.xyz;
      let response = local * properties[i].inertia.xyz + vec3f(c.x * local.y + c.y * local.z, c.x * local.x + c.z * local.z, c.y * local.x + c.z * local.y);
      velocities[i].angular += vec4f(rotate(q[i], response), 0.0);
    } else if (c.linear.w == 2.0) {
      velocities[i].linear = vec4f(c.linear.xyz, 0.0); velocities[i].angular = vec4f(c.angular.xyz, 0.0);
    }
  }
  commands[i].destination.w = 0.0; commands[i].linear = vec4f(0.0); commands[i].angular = vec4f(0.0);
}
`;
const cache = new WeakMap<GPUDevice, Promise<GPUComputePipeline>>();
export function prepareRigidBodyCommands(device: GPUDevice) {
  let pending = cache.get(device);
  if (!pending) {
    pending = device.createComputePipelineAsync({ layout: "auto", compute: { module: device.createShaderModule({ label: "physics.bodyCommands", code: shader }), entryPoint: "apply" } }).catch((error) => { cache.delete(device); throw error; });
    cache.set(device, pending);
  }
  return pending;
}

/** CPU writes sparse authored commands; velocity arithmetic and poses stay on GPU. */
export function createRigidBodyCommands(device: GPUDevice, world: RigidWorldDescriptor, pipeline: GPUComputePipeline,
  position: GPUBuffer, orientation: GPUBuffer, properties: GPUBuffer, velocities: GPUBuffer[]) {
  const buffer = device.createBuffer({ label: "physics.bodyCommands", size: world.bodies.length * STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const data = new ArrayBuffer(16); new Float32Array(data)[0] = world.fixedTimestep; new Uint32Array(data)[1] = world.bodies.length;
  const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM, mappedAtCreation: true });
  new Uint8Array(params.getMappedRange()).set(new Uint8Array(data)); params.unmap();
  const groups = velocities.map((velocity) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0),
    entries: [position, orientation, velocity, buffer, properties, params].map((item, binding) => ({ binding, resource: { buffer: item } })) }));
  const pending = new Map<number, Float32Array<ArrayBuffer>>();
  const forces = new Map<number, Float32Array<ArrayBuffer>>();
  const emptyCommand = new Float32Array(16);
  return {
    reset(index: number, clearPending = true) {
      if (clearPending) { pending.delete(index); forces.delete(index); }
      device.queue.writeBuffer(buffer, index * STRIDE, emptyCommand);
    },
    queue(command: RigidBodyCommand) {
      const body = world.bodies[command.body];
      if (!Number.isInteger(command.body) || !body) throw new Error("Unknown physics body index.");
      const values = command.kind === "kinematic-target" ? [...command.position, ...command.orientation] : [...command.linear, ...(command.angular ?? [0, 0, 0])];
      if (!values.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) throw new Error("Body commands require finite f32 values.");
      if (command.kind === "force") {
        if (body.mass <= 0 || command.linear.length !== 3 || command.angular && command.angular.length !== 3) throw new Error("Forces require a dynamic body and 3D vectors.");
        forces.set(command.body, new Float32Array([...command.linear, 0, ...(command.angular ?? [0, 0, 0]), 0]));
        return;
      }
      const previous = pending.get(command.body);
      const next = previous ? new Float32Array(previous) : new Float32Array(16);
      if (command.kind === "kinematic-target") {
        if (body.binding.bodyType !== "kinematic" || command.position.length !== 3 || command.orientation.length !== 4) throw new Error("Kinematic targets require a kinematic body, position and quaternion.");
        const length = Math.hypot(...command.orientation); if (length < 1e-8) throw new Error("Invalid target quaternion.");
        next.set([...command.position, 1], 0); next.set(command.orientation.map((value) => value / length), 4);
      } else {
        if (body.mass <= 0 || command.linear.length !== 3 || command.angular && command.angular.length !== 3) throw new Error("Velocity/impulse commands require a dynamic body and 3D vectors.");
        const mode = command.kind === "impulse" ? 1 : 2;
        if (next[11] && next[11] !== mode) throw new Error("Do not mix velocity and impulse for one body before its next tick.");
        for (let axis = 0; axis < 3; axis++) {
          next[8 + axis] = command.linear[axis] + (mode === 1 ? next[8 + axis] : 0);
          next[12 + axis] = (command.angular?.[axis] ?? 0) + (mode === 1 ? next[12 + axis] : 0);
        }
        next[11] = mode;
      }
      if (!next.every(Number.isFinite)) throw new Error("Accumulated body command exceeds the finite f32 range.");
      pending.set(command.body, next);
    },
    upload() {
      for (const [index, values] of pending) device.queue.writeBuffer(buffer, index * STRIDE, values);
      for (const [index, values] of forces) {
        const offset = index * RIGID_LAYOUT.propertyBytes + RIGID_LAYOUT.forceOffsetBytes;
        device.queue.writeBuffer(properties, offset, values.subarray(0, 3));
        device.queue.writeBuffer(properties, offset + 16, values.subarray(4, 7));
      }
      pending.clear(); forces.clear();
    },
    encode(encoder: GPUCommandEncoder, bank = 0) {
      const pass = encoder.beginComputePass({ label: "physics.bodyCommands" });
      pass.setPipeline(pipeline); pass.setBindGroup(0, groups[bank]); pass.dispatchWorkgroups(Math.ceil(world.bodies.length / 64)); pass.end();
    },
    destroy() { pending.clear(); forces.clear(); buffer.destroy(); params.destroy(); },
  };
}
