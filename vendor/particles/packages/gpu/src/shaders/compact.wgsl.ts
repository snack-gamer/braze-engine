/**
 * Builds compact visible particle index lists and indirect draw arguments.
 *
 * indirect args are 5 u32 per batch:
 * - sprite drawIndirect uses the first 4 fields: vertexCount, instanceCount, firstVertex, firstInstance
 * - mesh drawIndexedIndirect uses all 5: indexCount, instanceCount, firstIndex, baseVertex, firstInstance
 */
export const COMPACT_WGSL = /* wgsl */ `
struct Particle {
  position: vec4f,
  velocity: vec4f,
  color: vec4f,
  params: vec4f,
  start_color: vec4f,
};

struct CompactParams {
  capacity: u32,
  mode: u32,          // 0 sprite, 1 mesh
  batch_count: u32,
  distribution: u32,  // 0 single, 1 uniform random, 2 weighted random
  weights: vec4f,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> visible_indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> indirect: array<atomic<u32>>;
@group(0) @binding(3) var<uniform> params: CompactParams;

fn hash01(seed_in: u32, salt: u32) -> f32 {
  var x = seed_in ^ salt;
  x = x * 747796405u + 2891336453u;
  let word = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((word >> 8u) & 0x00ffffffu) / 16777215.0;
}

fn selected_mesh(seed: u32) -> u32 {
  let count = max(1u, params.batch_count);
  let pick = hash01(seed, 0x632be59bu);
  if (params.distribution == 2u) {
    let total = max(params.weights.x + params.weights.y + params.weights.z + params.weights.w, 0.0001);
    let pick_weight = pick * total;
    if (pick_weight <= params.weights.x) { return 0u; }
    if (pick_weight <= params.weights.x + params.weights.y) { return min(1u, count - 1u); }
    if (pick_weight <= params.weights.x + params.weights.y + params.weights.z) { return min(2u, count - 1u); }
    return min(3u, count - 1u);
  }
  if (params.distribution == 1u) {
    return min(u32(floor(pick * f32(count))), count - 1u);
  }
  return 0u;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.capacity) { return; }
  let p = particles[i];
  if (p.position.w <= 0.0) { return; }

  var batch = 0u;
  if (params.mode == 1u) {
    batch = selected_mesh(bitcast<u32>(p.params.w));
    if (batch >= params.batch_count) { return; }
  }

  let args_base = batch * 5u;
  let write_index = atomicAdd(&indirect[args_base + 1u], 1u);
  visible_indices[batch * params.capacity + write_index] = i;
}
`;
