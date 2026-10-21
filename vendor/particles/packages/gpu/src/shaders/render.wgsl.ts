/**
 * Billboard render shader.
 *
 * Bindings (group 0):
 *   0: storage<read> particles
 *   1: uniform RenderGlobals
 *   2: texture_2d<f32>  particle sprite (or default soft circle)
 *   3: sampler          filtering
 *   4: texture_2d<f32>  frame LUT (1×N when sprite anim enabled, 1×1 otherwise)
 *
 * Output is always premultiplied alpha. The blend mode (additive / alpha /
 * multiply) is selected at the pipeline level via blend factors.
 */
export const RENDER_WGSL = /* wgsl */ `
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
  tile_dim:   vec2f,    // cols, rows; (1,1) when no sprite anim
  cycles:     f32,
  sprite_on:  f32,      // 1.0 = use atlas UV, 0.0 = full quad
  render_params: vec4f, // mode, facing, unused, unused
  pivot_flip: vec4f,    // pivot x/y, flip probability x/y
  stretch: vec4f,       // velocity scale, length scale, rotate with stretch, unused
  mesh_scale: vec4f,
  mesh_select: vec4f,
  mesh_weights: vec4f,
  material: vec4f,      // alpha cutoff, emissive strength, shading, two sided
  flipbook: vec4f,      // time mode, playback, fps, start frame
  flipbook_layout: vec4f, // single row, random row, row, random start
  flipbook_speed: vec4f,  // min speed, max speed, cycles, unused
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> r: RenderGlobals;
@group(0) @binding(2) var tex:       texture_2d<f32>;
@group(0) @binding(3) var samp:      sampler;
@group(0) @binding(4) var frame_lut: texture_2d<f32>;
@group(0) @binding(5) var<storage, read> visible_indices: array<u32>;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
};

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

fn orient_right_up(mode: f32, facing: f32, velocity: vec3f) -> mat2x3f {
  let camera_right = safe_normalize(r.camera_right, vec3f(1.0, 0.0, 0.0));
  let camera_up = safe_normalize(r.camera_up, vec3f(0.0, 1.0, 0.0));
  let camera_forward = safe_normalize(cross(camera_right, camera_up), vec3f(0.0, 0.0, 1.0));

  if (mode > 1.5 && mode < 2.5) {
    return mat2x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0));
  }
  if (mode > 2.5 && mode < 3.5) {
    return mat2x3f(camera_right, vec3f(0.0, 1.0, 0.0));
  }

  if (facing > 1.5 && facing < 2.5) {
    let up = safe_normalize(velocity, camera_up);
    let right = safe_normalize(cross(up, camera_forward), camera_right);
    return mat2x3f(right, up);
  }
  if (facing > 2.5 && facing < 3.5) {
    return mat2x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0));
  }
  if (facing > 3.5 && facing < 4.5) {
    let local_right = safe_normalize((r.model * vec4f(1.0, 0.0, 0.0, 0.0)).xyz, camera_right);
    let local_up = safe_normalize((r.model * vec4f(0.0, 1.0, 0.0, 0.0)).xyz, camera_up);
    return mat2x3f(local_right, local_up);
  }

  return mat2x3f(camera_right, camera_up);
}

@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> VsOut {
  let p = particles[visible_indices[iid]];
  // position.w stores total lifetime; 0 = empty slot. Anything positive is a
  // live particle, regardless of how short its lifetime is. (Using step(0.5)
  // here used to wipe out anyone authored with sub-half-second lifetimes.)
  let alive = select(0.0, 1.0, p.position.w > 0.0 && r.render_params.x < 3.5);
  let size = p.params.y * alive;

  let corners = array<vec2f, 4>(
    vec2f(-0.5, -0.5),
    vec2f( 0.5, -0.5),
    vec2f(-0.5,  0.5),
    vec2f( 0.5,  0.5),
  );
  var c = corners[vid];
  var flipbook_visible = 1.0;
  let seed = bitcast<u32>(p.params.w);
  if (hash01(seed, 0x9e3779b9u) < r.pivot_flip.z) {
    c.x = -c.x;
  }
  if (hash01(seed, 0x85ebca6bu) < r.pivot_flip.w) {
    c.y = -c.y;
  }
  c = c - r.pivot_flip.xy;
  var uv = c + vec2f(0.5);

  // Sprite-sheet atlas UV computation.
  if (r.sprite_on > 0.5) {
    let lifetime = p.position.w;
    let age = p.velocity.w;
    let nt = clamp(age / max(lifetime, 1e-6), 0.0, 1.0);
    let cols = r.tile_dim.x;
    let rows = r.tile_dim.y;
    let total = cols * rows;
    let single_row = r.flipbook_layout.x > 0.5;
    let sequence_total = select(total, cols, single_row);

    // Sample frame_lut.x at nt
    let lut_w = f32(textureDimensions(frame_lut).x);
    let xf = clamp(nt, 0.0, 1.0) * (lut_w - 1.0);
    let i0 = u32(floor(xf));
    let i1 = min(i0 + 1u, u32(lut_w) - 1u);
    let f = fract(xf);
    let a0 = textureLoad(frame_lut, vec2u(i0, 0u), 0).x;
    let a1 = textureLoad(frame_lut, vec2u(i1, 0u), 0).x;
    let b0 = textureLoad(frame_lut, vec2u(i0, 0u), 0).y;
    let b1 = textureLoad(frame_lut, vec2u(i1, 0u), 0).y;
    let rframe = hash01(seed, 0x51ed270bu);
    let curve_min = mix(a0, a1, f);
    let curve_max = mix(b0, b1, f);
    let curve_v = mix(curve_min, curve_max, rframe);
    var progress = curve_v * r.cycles;
    if (r.flipbook.x < 0.5) {
      progress = age * r.flipbook.z / max(sequence_total, 1.0);
    } else if (r.flipbook.x > 1.5) {
      progress = clamp((length(p.velocity.xyz) - r.flipbook_speed.x) / max(r.flipbook_speed.y - r.flipbook_speed.x, 1e-5), 0.0, 1.0) * r.flipbook_speed.z;
    }
    let random_start = select(0.0, floor(hash01(seed, 0x4b1dca6bu) * sequence_total), r.flipbook_layout.w > 0.5);
    let raw_frame = floor(progress * sequence_total) + r.flipbook.w + random_start;
    var visible = 1.0;
    var frame_idx = raw_frame;
    if (r.flipbook.y < 0.5) {
      visible = select(1.0, 0.0, raw_frame >= sequence_total);
      frame_idx = clamp(raw_frame, 0.0, sequence_total - 1.0);
    } else if (r.flipbook.y < 1.5) {
      frame_idx = raw_frame - floor(raw_frame / sequence_total) * sequence_total;
    } else if (r.flipbook.y < 2.5) {
      let period = max(1.0, sequence_total * 2.0 - 2.0);
      let ping = raw_frame - floor(raw_frame / period) * period;
      frame_idx = select(ping, period - ping, ping >= sequence_total);
    } else {
      frame_idx = clamp(raw_frame, 0.0, sequence_total - 1.0);
    }
    let col = frame_idx - floor(frame_idx / cols) * cols;
    let row = select(floor(frame_idx / cols), select(r.flipbook_layout.z, floor(hash01(seed, 0xa441c63du) * rows), r.flipbook_layout.y > 0.5), single_row);
    uv = vec2f((col + uv.x) / cols, (row + uv.y) / rows);
    flipbook_visible = visible;
  }

  // Apply sprite-space rotation.
  let rot = p.params.z;
  let cs = cos(rot);
  let sn = sin(rot);
  let rc = vec2f(c.x * cs - c.y * sn, c.x * sn + c.y * cs);

  let world_center = (r.model * vec4f(p.position.xyz, 1.0)).xyz;
  var axes = orient_right_up(r.render_params.x, r.render_params.y, p.velocity.xyz);
  var right = axes[0];
  var up = axes[1];
  var width = size;
  var height = size;
  if (r.render_params.x > 0.5 && r.render_params.x < 1.5) {
    let speed = length(p.velocity.xyz);
    height = max(size, size * max(r.stretch.y, 0.0) + speed * max(r.stretch.x, 0.0));
    if (r.stretch.z > 0.5) {
      up = safe_normalize(p.velocity.xyz, up);
      let camera_forward = safe_normalize(cross(r.camera_right, r.camera_up), vec3f(0.0, 0.0, 1.0));
      right = safe_normalize(cross(up, camera_forward), right);
    }
  }
  let world_pos = world_center + right * rc.x * width + up * rc.y * height;

  var out: VsOut;
  out.pos = r.view_proj * vec4f(world_pos, 1.0);
  out.uv = uv;
  out.color = p.color * r.tint * vec4f(1.0, 1.0, 1.0, flipbook_visible);
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let s = textureSample(tex, samp, in.uv);
  let col = in.color * s;
  if (col.a < r.material.x) {
    discard;
  }
  // Premultiplied output. Blend factors at pipeline level decide additive vs alpha.
  return vec4f(col.rgb * max(r.material.y, 0.0) * col.a, col.a);
}
`;
