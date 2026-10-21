import { rigidTriangleContactsWgsl } from "../shaders/rigid-triangle-contacts";
import { rigidCompoundContactsWgsl } from "../shaders/rigid-compound-contacts";
import { rigidCapsuleContactsWgsl } from "../shaders/rigid-capsule-contacts";
import { rigidTypesWgsl, rigidMathWgsl } from "../shaders/rigid-common";
import { rigidSphereContactsWgsl } from "../shaders/rigid-sphere-contacts";
import { rigidBoxContactsWgsl } from "../shaders/rigid-box-contacts";
import { LARGE_RIGID } from "./rigid-spatial-layout";

export const largeHeaderWgsl = rigidTypesWgsl + /* wgsl */`
struct Node { low: vec3f, body: u32, high: vec3f, unused: u32 }
struct Stage { start: u32, unused0: u32, unused1: u32, unused2: u32 }
@group(0) @binding(0) var<uniform> params: Parameters;
@group(0) @binding(1) var<storage, read> properties: array<Properties>;
@group(0) @binding(2) var<storage, read_write> p: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> q: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> tree: array<Node>;
@group(0) @binding(5) var<storage, read_write> status: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> manifolds: array<Manifold>;
@group(0) @binding(7) var<storage, read> previous: array<Manifold>;
@group(0) @binding(9) var<storage, read> inputVelocity: array<Velocity>;
@group(0) @binding(8) var<uniform> stage: Stage;
fn collisionLinearVelocity(body: u32) -> vec3f { return inputVelocity[body].linear.xyz; }
fn collisionAngularVelocity(body: u32) -> vec3f { return inputVelocity[body].angular.xyz; }
const NEIGHBORS = ${LARGE_RIGID.neighbors}u;
` + rigidMathWgsl;

export const largeGeometryWgsl = largeHeaderWgsl + rigidSphereContactsWgsl + rigidBoxContactsWgsl + rigidTriangleContactsWgsl + rigidCapsuleContactsWgsl + rigidCompoundContactsWgsl;

export const largeTreeWgsl = largeHeaderWgsl + /* wgsl */`
@compute @workgroup_size(1)
fn tick() { atomicAdd(&status[3], 1u); }
fn extent(body: u32) -> vec3f {
  let shape = properties[body].shape;
  if (shape.w > 2.5) { return vec3f(shape.z + 0.02); }
  if (shape.w > 1.5) { return abs(axis(q[body], 1u)) * shape.y + vec3f(shape.x + 0.02); }
  if (shape.w > 0.5) { return vec3f(shape.x + 0.02); }
  return abs(axis(q[body], 0u)) * shape.x + abs(axis(q[body], 1u)) * shape.y
    + abs(axis(q[body], 2u)) * shape.z + vec3f(0.02);
}
@compute @workgroup_size(64)
fn leaves(@builtin(global_invocation_id) id: vec3u) {
  let leaf = id.x; if (leaf >= params.paddedCount) { return; }
  let slot = params.paddedCount + leaf; let body = tree[slot].body;
  if (body >= params.count) { tree[slot].low = vec3f(1e30); tree[slot].high = vec3f(-1e30); return; }
  if (properties[body].collision.y == 0u) { tree[slot].low = vec3f(1e30); tree[slot].high = vec3f(-1e30); return; }
  let half = sweptExtent(body, extent(body)); tree[slot].low = p[body].xyz - half; tree[slot].high = p[body].xyz + half;
}
@compute @workgroup_size(64)
fn refit(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= stage.start) { return; }
  let slot = stage.start + id.x;
  tree[slot].low = min(tree[slot * 2u].low, tree[slot * 2u + 1u].low);
  tree[slot].high = max(tree[slot * 2u].high, tree[slot * 2u + 1u].high);
}
`;
