/**
 * Instanced mesh particle renderer.
 *
 * This path intentionally keeps mesh particles separate from billboard
 * particles so the backend can batch and indirect-draw mesh/material groups
 * later without complicating sprite rendering.
 */
export const MESH_RENDER_WGSL = /* wgsl */ `
struct Particle {
  position: vec4f,
  velocity: vec4f,
  color: vec4f,
  params: vec4f,
  start_color: vec4f,
};

struct RenderGlobals {
  view_proj: mat4x4f,
  model:     mat4x4f,
  camera_right: vec3f, _p0: f32,
  camera_up:    vec3f, _p1: f32,
  tint:       vec4f,
  tile_dim:   vec2f,
  cycles:     f32,
  sprite_on:  f32,
  render_params: vec4f, // mode, facing, mesh random rot x, mesh random rot y
  pivot_flip: vec4f,
  stretch: vec4f, // velocity scale, length scale, rotate with stretch, mesh random rot z
  mesh_scale: vec4f,
  mesh_select: vec4f, // current index, count, distribution, weight sum
  mesh_weights: vec4f,
  material: vec4f,    // alpha cutoff, emissive strength, shading, two sided
  flipbook: vec4f,
  flipbook_layout: vec4f,
  flipbook_speed: vec4f,
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> r: RenderGlobals;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var<storage, read> visible_indices: array<u32>;

struct VsIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

fn rot_y(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

fn rot_x(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

fn rot_z(v: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

fn rotate_xyz(v: vec3f, angles: vec3f) -> vec3f {
  return rot_z(rot_y(rot_x(v, angles.x), angles.y), angles.z);
}

fn safe_normalize(v: vec3f, fallback: vec3f) -> vec3f {
  let len = length(v);
  return select(fallback, v / len, len > 1e-5);
}

fn hash01(seed_in: u32, salt: u32) -> f32 {
  var x = seed_in ^ salt;
  x = x * 747796405u + 2891336453u;
  let word = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((word >> 8u) & 0x00ffffffu) / 16777215.0;
}

fn selected_mesh(seed: u32) -> f32 {
  let count = max(1.0, r.mesh_select.y);
  let distribution = r.mesh_select.z;
  let pick = hash01(seed, 0x632be59bu);
  if (distribution > 1.5) {
    let pick_weight = pick * max(r.mesh_select.w, 0.0001);
    if (pick_weight <= r.mesh_weights.x) { return 0.0; }
    if (pick_weight <= r.mesh_weights.x + r.mesh_weights.y) { return min(1.0, count - 1.0); }
    if (pick_weight <= r.mesh_weights.x + r.mesh_weights.y + r.mesh_weights.z) { return min(2.0, count - 1.0); }
    return min(3.0, count - 1.0);
  }
  if (distribution > 0.5) {
    return floor(pick * count);
  }
  return 0.0;
}

fn velocity_basis(velocity: vec3f) -> mat3x3f {
  let forward = safe_normalize(velocity, vec3f(0.0, 1.0, 0.0));
  let helper = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(forward.y) > 0.96);
  let right = safe_normalize(cross(helper, forward), vec3f(1.0, 0.0, 0.0));
  let up = safe_normalize(cross(forward, right), vec3f(0.0, 1.0, 0.0));
  return mat3x3f(right, forward, up);
}

@vertex
fn vs_main(in: VsIn, @builtin(instance_index) iid: u32) -> VsOut {
  let p = particles[visible_indices[u32(r.mesh_select.x) * u32(r.mesh_scale.w) + iid]];
  let chosen = selected_mesh(bitcast<u32>(p.params.w));
  let in_batch = abs(chosen - r.mesh_select.x) < 0.5;
  let alive = select(0.0, 1.0, p.position.w > 0.0 && in_batch);
  let size = p.params.y * alive;
  let scaled = in.position * r.mesh_scale.xyz * size;
  let seed = bitcast<u32>(p.params.w);
  let jitter = vec3f(
    (hash01(seed, 0x9e3779b9u) * 2.0 - 1.0) * r.render_params.z,
    (hash01(seed, 0x85ebca6bu) * 2.0 - 1.0) * r.render_params.w,
    (hash01(seed, 0xc2b2ae35u) * 2.0 - 1.0) * r.stretch.w,
  );
  let angles = vec3f(jitter.x, p.params.z + jitter.y, jitter.z);
  var local = rotate_xyz(scaled, angles);
  var normal = rotate_xyz(in.normal, angles);

  if (r.render_params.y > 1.5 && r.render_params.y < 2.5) {
    let basis = velocity_basis(p.velocity.xyz);
    local = basis * local;
    normal = basis * normal;
  }

  let world_center = (r.model * vec4f(p.position.xyz, 1.0)).xyz;
  let world_normal = safe_normalize((r.model * vec4f(normal, 0.0)).xyz, vec3f(0.0, 1.0, 0.0));
  let world_pos = world_center + (r.model * vec4f(local, 0.0)).xyz;

  var out: VsOut;
  out.pos = r.view_proj * vec4f(world_pos, 1.0);
  out.color = p.color * r.tint;
  out.normal = world_normal;
  out.uv = in.uv;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let light = safe_normalize(vec3f(0.35, 0.8, 0.45), vec3f(0.0, 1.0, 0.0));
  let ndl = max(dot(in.normal, light), 0.0);
  let shade = 0.38 + ndl * 0.62;
  let texel = textureSample(tex, samp, in.uv);
  if (texel.a * in.color.a < r.material.x) {
    discard;
  }
  let col = vec4f(in.color.rgb * texel.rgb * shade, in.color.a * texel.a);
  let light_mix = select(1.0, shade, r.material.z > 0.5);
  let shaded = vec4f(in.color.rgb * texel.rgb * light_mix * max(r.material.y, 0.0), col.a);
  return vec4f(shaded.rgb * shaded.a, shaded.a);
}
`;
