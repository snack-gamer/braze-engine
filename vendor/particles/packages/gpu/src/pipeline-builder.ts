import type { LUTDescriptor, ModuleManifest, UniformDescriptor } from '@particles/core';
import { COMMON_WGSL } from './shaders/common.wgsl';

export interface CompositeShader {
  /** Final WGSL source for the compute pipeline. */
  code: string;
  /** Flat uniform list, ordered as packed into the uniform buffer. */
  uniforms: UniformDescriptor[];
  /** Total uniform buffer size in bytes (std140-ish layout, vec4-aligned). */
  uniformBufferSize: number;
  /** Per-uniform byte offset into the uniform buffer. */
  uniformOffsets: Map<string, number>;
  /** Flat LUT list, ordered as bound to the bind group starting at LUT_BIND_BASE. */
  luts: LUTDescriptor[];
}

/** Bind group layout (group 0):
 *   binding 0: storage<read_write> particles
 *   binding 1: uniform globals  (frame uniforms — time, dt, capacity, emit cursor, emit count, seed)
 *   binding 2: uniform module_u (packed module uniforms)
 *   binding 3: uniform field effectors
 *   binding 4: uniform particle colliders
 *   binding 5: storage<read_write> compact particle event queue
 *   binding 6..: LUT textures (texture_2d<f32>)
 *
 * Sampler not needed — we use textureLoad with explicit coords.
 */
export const LUT_BIND_BASE = 6;

export interface BuildOptions {
  /** 'emit' or 'simulate' — picks which snippets to include and the kernel signature. */
  kind: 'emit' | 'simulate';
  modules: ModuleManifest[];
}

export function buildComputeShader(opts: BuildOptions): CompositeShader {
  const uniforms = collectUniforms(opts.modules);
  const { code: uniformBlockCode, offsets, size } = packUniforms(uniforms);
  const luts = collectLUTs(opts.modules);
  const lutDecls = luts
    .map((l, i) => `@group(0) @binding(${LUT_BIND_BASE + i}) var ${l.name}_tex: texture_2d<f32>;`)
    .join('\n');

  const snippets = opts.modules
    .map((m) => {
      const code = opts.kind === 'emit' ? m.emitWGSL : m.simulateWGSL;
      if (!code) return '';
      return `// --- module: ${m.id} ---\n${code}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const kernel =
    opts.kind === 'emit'
      ? EMIT_KERNEL.replace('// __MODULE_SNIPPETS__', snippets)
      : SIMULATE_KERNEL.replace('// __MODULE_SNIPPETS__', snippets);

  const code = [
    COMMON_WGSL,
    GLOBAL_UNIFORMS_WGSL,
    FIELD_EFFECTORS_WGSL,
    COLLIDERS_WGSL,
    EVENTS_WGSL,
    uniformBlockCode,
    `@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;`,
    lutDecls,
    kernel,
  ].join('\n\n');

  return { code, uniforms, uniformBufferSize: size, uniformOffsets: offsets, luts };
}

const GLOBAL_UNIFORMS_WGSL = /* wgsl */ `
struct Globals {
  emit_xform: mat4x4f,   // applied at emit time (world or identity, depending on simSpace)
  time: f32,
  dt: f32,
  capacity: u32,
  emit_cursor: u32,
  emit_count: u32,
  system_seed: u32,
  event_flags: u32,
  event_capacity: u32,
};
@group(0) @binding(1) var<uniform> g: Globals;
`;

const EVENTS_WGSL = /* wgsl */ `
const EVENT_BIRTH: u32 = 0u;
const EVENT_DEATH: u32 = 1u;
const EVENT_COLLISION: u32 = 2u;
const EVENT_COLLIDER_NONE: u32 = 4294967295u;

struct ParticleEvent {
  info: vec4u,      // type, slot, collider index, generation
  position: vec4f,
  velocity: vec4f,
  normal: vec4f,
};

struct ParticleEvents {
  count: atomic<u32>,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  records: array<ParticleEvent>,
};

@group(0) @binding(5) var<storage, read_write> particle_events: ParticleEvents;

fn event_enabled(kind: u32) -> bool {
  return (g.event_flags & (1u << kind)) != 0u;
}

fn particle_generation(p: Particle) -> u32 {
  return bitcast<u32>(p.params.w) >> 24u;
}

fn write_particle_event(
  kind: u32,
  slot: u32,
  collider_index: u32,
  generation: u32,
  speed: f32,
  position: vec3f,
  velocity: vec3f,
  normal: vec3f,
) {
  if (!event_enabled(kind) || g.event_capacity == 0u) {
    return;
  }
  let index = atomicAdd(&particle_events.count, 1u);
  if (index >= g.event_capacity) {
    return;
  }
  particle_events.records[index].info = vec4u(kind, slot, collider_index, generation);
  particle_events.records[index].position = vec4f(position, 1.0);
  particle_events.records[index].velocity = vec4f(velocity, 0.0);
  particle_events.records[index].normal = vec4f(normal, speed);
}
`;

const EMIT_KERNEL = /* wgsl */ `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= g.emit_count) { return; }
  let slot = (g.emit_cursor + i) % g.capacity;

  // Per-particle seed: mix system seed with absolute spawn index.
  var seed = hash_u32(g.system_seed ^ hash_u32(g.emit_cursor + i));

  // Defaults — modules override.
  var p: Particle;
  p.position = vec4f(0.0, 0.0, 0.0, 1.0);  // w = lifetime (will be overwritten by Main)
  p.velocity = vec4f(0.0, 0.0, 0.0, 0.0);  // w = age = 0
  p.color    = vec4f(1.0, 1.0, 1.0, 1.0);
  p.params   = vec4f(1.0, 1.0, 0.0, bitcast<f32>(seed)); // startSize=1, size=1, rot=0
  p.start_color = vec4f(1.0, 1.0, 1.0, 1.0);

  // __MODULE_SNIPPETS__

  // Apply emit-time transform. In local simulation space this is identity (model matrix
  // is applied at render). In world space this bakes the parent's world transform into the
  // spawn so emitted particles detach from the system once born.
  let lifetimePreserve = p.position.w;
  let local_pos = p.position.xyz;
  p.position = vec4f((g.emit_xform * vec4f(local_pos, 1.0)).xyz, lifetimePreserve);
  let R3 = mat3x3f(g.emit_xform[0].xyz, g.emit_xform[1].xyz, g.emit_xform[2].xyz);
  p.velocity = vec4f(R3 * p.velocity.xyz, 0.0);
  p.params.w = bitcast<f32>(bitcast<u32>(p.params.w) & 0x00ffffffu);

  particles[slot] = p;
  write_particle_event(EVENT_BIRTH, slot, EVENT_COLLIDER_NONE, particle_generation(p), length(p.velocity.xyz), p.position.xyz, p.velocity.xyz, vec3f(0.0, 1.0, 0.0));
}
`;

const SIMULATE_KERNEL = /* wgsl */ `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= g.capacity) { return; }
  var p = particles[i];
  let lifetime = p.position.w;
  if (lifetime <= 0.0) { return; }

  // Age the particle.
  p.velocity.w = p.velocity.w + g.dt;
  let age = p.velocity.w;
  let nt = clamp(age / lifetime, 0.0, 1.0);
  var seed = bitcast<u32>(p.params.w);
  // Infinite-lifetime particles (Main writes 1e20) bypass over-life modules.
  let finite_life = lifetime < 1.0e19;
  // Colour is recomputed from the spawn colour every step so the gradient /
  // opacity modules stay absolute in normalized lifetime instead of
  // compounding a multiply per frame (which would be framerate-dependent).
  p.color = p.start_color;

  // __MODULE_SNIPPETS__

  p = apply_field_effectors(p);

  // Integrate position with current velocity.
  p.position = vec4f(p.position.xyz + p.velocity.xyz * g.dt, lifetime);

  // Kill expired particles.
  if (age >= lifetime) {
    write_particle_event(EVENT_DEATH, i, EVENT_COLLIDER_NONE, particle_generation(p), length(p.velocity.xyz), p.position.xyz, p.velocity.xyz, vec3f(0.0, 1.0, 0.0));
    p.position.w = 0.0;
  }

  particles[i] = p;
}
`;

const FIELD_EFFECTORS_WGSL = /* wgsl */ `
const MAX_FIELD_EFFECTORS: u32 = 8u;

struct FieldEffectors {
  header: vec4f,              // count, unused, unused, unused
  items: array<vec4f, 48>,    // 6 vec4s per effector
};
@group(0) @binding(3) var<uniform> field_eff: FieldEffectors;

fn field_safe_normalize(v: vec3f, fallback: vec3f) -> vec3f {
  let len = length(v);
  return select(fallback, v / len, len > 1e-5);
}

fn field_shape_factor(position: vec3f, shape: f32, falloff: f32, center: vec3f, radius: f32, size: vec3f) -> f32 {
  var raw = 1.0;
  if (shape > 0.5 && shape < 1.5) {
    raw = 1.0 - distance(position, center) / max(radius, 0.0001);
  } else if (shape > 1.5 && shape < 2.5) {
    let half_size = max(size * 0.5, vec3f(0.0001));
    let q = abs(position - center) / half_size;
    raw = 1.0 - max(max(q.x, q.y), q.z);
  }
  let inside = raw > 0.0;
  if (falloff < 0.5) {
    return select(0.0, 1.0, inside);
  }
  let t = clamp(raw, 0.0, 1.0);
  if (falloff > 1.5) {
    return t * t * (3.0 - 2.0 * t);
  }
  return t;
}

fn apply_field_effectors(p_in: Particle) -> Particle {
  var p = p_in;
  let count = min(u32(field_eff.header.x), MAX_FIELD_EFFECTORS);
  for (var i = 0u; i < count; i = i + 1u) {
    let base = i * 6u;
    let a = field_eff.items[base];
    let b = field_eff.items[base + 1u];
    let c = field_eff.items[base + 2u];
    let d = field_eff.items[base + 3u];
    let e = field_eff.items[base + 4u];
    let f = field_eff.items[base + 5u];
    let kind = a.x;
    var field_seed = hash_u32(bitcast<u32>(p.params.w) ^ hash_u32(i + 0x9e3779b9u));
    let center_jitter = max(e.z, 0.0);
    let direction_jitter = clamp(e.w, 0.0, 1.0);
    let strength_jitter = clamp(d.w, 0.0, 1.0);
    let center = b.xyz + rand_sphere(&field_seed) * center_jitter;
    let varied_strength = a.z * (1.0 + rand_range(&field_seed, -strength_jitter, strength_jitter));
    let factor = field_shape_factor(p.position.xyz, a.y, a.w, center, b.w, d.xyz);
    if (factor <= 0.0) {
      continue;
    }
    let strength = varied_strength * factor;
    if (kind > 0.5 && kind < 1.5) {
      let dir = field_safe_normalize(c.xyz + rand_sphere(&field_seed) * direction_jitter, vec3f(1.0, 0.0, 0.0));
      p.velocity = vec4f(p.velocity.xyz + dir * strength * g.dt, p.velocity.w);
    } else if (kind > 1.5 && kind < 2.5) {
      let dir = field_safe_normalize(p.position.xyz - center, field_safe_normalize(c.xyz, vec3f(0.0, 1.0, 0.0)));
      p.velocity = vec4f(p.velocity.xyz + dir * strength * g.dt, p.velocity.w);
    } else if (kind > 2.5 && kind < 3.5) {
      let axis = field_safe_normalize(c.xyz + rand_sphere(&field_seed) * direction_jitter, vec3f(0.0, 1.0, 0.0));
      let radial = p.position.xyz - center;
      let axial = axis * dot(radial, axis);
      let planar = radial - axial;
      let planar_len = length(planar);
      let outward = field_safe_normalize(planar, vec3f(1.0, 0.0, 0.0));
      let tangent = field_safe_normalize(cross(axis, outward), vec3f(1.0, 0.0, 0.0));
      let field_radius = select(
        max(b.w, 0.0),
        min(min(d.x, d.y), d.z) * 0.5,
        a.y > 1.5 && a.y < 2.5,
      );
      let spin_response = clamp(abs(strength) * g.dt, 0.0, 1.0);
      let radial_velocity = dot(p.velocity.xyz, outward);
      let tangential_velocity = dot(p.velocity.xyz, tangent);
      let target_tangent = strength;
      var next_velocity = p.velocity.xyz + tangent * ((target_tangent - tangential_velocity) * spin_response);
      let vortex_mode = c.w;
      let hold_response = clamp(max(e.x, 0.0) * g.dt, 0.0, 1.0);
      if (vortex_mode > 0.5 && vortex_mode < 1.5) {
        let target_radial = -planar_len * max(abs(strength), 1.0);
        next_velocity = next_velocity + outward * ((target_radial - radial_velocity) * hold_response);
      } else if (vortex_mode > 1.5 && vortex_mode < 2.5) {
        let target_radius = clamp(max(e.y, 0.0), 0.0, max(field_radius * 0.95, 0.0001));
        let error = planar_len - target_radius;
        let target_radial = -error * max(abs(strength), 1.0);
        next_velocity = next_velocity + outward * ((target_radial - radial_velocity) * hold_response);
      }
      let axial_velocity = dot(next_velocity, axis);
      let lift = f.x * (1.0 + rand_range(&field_seed, -clamp(f.z, 0.0, 1.0), clamp(f.z, 0.0, 1.0)));
      let axial_response = max(0.08, clamp(f.y, 0.0, 1.0)) * factor;
      next_velocity = next_velocity + axis * ((lift - axial_velocity) * axial_response);
      p.velocity = vec4f(next_velocity, p.velocity.w);
    } else if (kind > 3.5 && kind < 4.5) {
      let damp = clamp(1.0 - strength * g.dt, 0.0, 1.0);
      p.velocity = vec4f(p.velocity.xyz * damp, p.velocity.w);
    } else if (kind > 4.5 && kind < 5.5) {
      // Divergence-free-ish animated curl surrogate. Turbulence bends existing
      // motion toward this field without injecting speed, matching BrazeFX.
      let scale = max(f.y, 0.05);
      let scale_jitter = exp2((rand_unit(&field_seed) * 2.0 - 1.0) * clamp(f.z, 0.0, 1.0));
      let q = (p.position.xyz - center) * (2.0 / scale) * scale_jitter + vec3f(g.time * 0.31, -g.time * 0.27, g.time * 0.19);
      var flow = vec3f(sin(q.y * 2.1) - cos(q.z * 1.7), sin(q.z * 2.3) - cos(q.x * 1.9), sin(q.x * 2.7) - cos(q.y * 1.3));
      let detail = clamp(f.x, 0.0, 1.0);
      flow = mix(flow, flow + vec3f(sin(q.z * 5.3), cos(q.x * 4.9), sin(q.y * 5.7)), detail);
      let speed = length(p.velocity.xyz);
      let response = min(1.0 - exp(-abs(strength) * g.dt), 0.35) * factor;
      let direction = field_safe_normalize(flow * select(-1.0, 1.0, strength >= 0.0), field_safe_normalize(p.velocity.xyz, vec3f(0.0, 1.0, 0.0)));
      p.velocity = vec4f(field_safe_normalize(mix(field_safe_normalize(p.velocity.xyz, direction), direction, response), direction) * speed, p.velocity.w);
    }
  }
  return p;
}
`;

const COLLIDERS_WGSL = /* wgsl */ `
const MAX_PARTICLE_COLLIDERS: u32 = 8u;

struct ParticleColliders {
  header: vec4f,              // count, unused, unused, unused
  items: array<vec4f, 48>,    // 6 vec4s per collider
};
@group(0) @binding(4) var<uniform> particle_colliders: ParticleColliders;

fn collider_safe_normalize(v: vec3f, fallback: vec3f) -> vec3f {
  let len = length(v);
  return select(fallback, v / len, len > 1e-5);
}

fn collider_respond(p_in: Particle, normal: vec3f, penetration: f32, a: vec4f, response_mode: f32, strength: f32) -> Particle {
  var p = p_in;
  if (penetration <= 0.0 || strength <= 0.0) {
    return p;
  }
  let n = collider_safe_normalize(normal, vec3f(0.0, 1.0, 0.0));
  p.position = vec4f(p.position.xyz + n * penetration * strength, p.position.w);

  let bounce = select(clamp(a.y, 0.0, 1.0), max(clamp(a.y, 0.0, 1.0), 0.18), response_mode > 0.5 && response_mode < 1.5);
  let friction = clamp(a.z, 0.0, 1.0);
  let stick = clamp(a.w, 0.0, 1.0);
  let vn = dot(p.velocity.xyz, n);
  var v = p.velocity.xyz;
  if (vn < 0.0) {
    v = v - n * vn * (1.0 + bounce);
  }
  let normal_v = n * max(dot(v, n), 0.0);
  var tangent_v = v - normal_v;
  tangent_v = tangent_v * max(0.0, 1.0 - friction * strength);

  if (response_mode > 1.5) {
    let settle_speed = max(0.0, a.x);
    let contact_speed = length(tangent_v) + abs(min(vn, 0.0));
    if (contact_speed < settle_speed) {
      tangent_v = tangent_v * max(0.0, 1.0 - stick);
      if (response_mode > 2.5) {
        tangent_v = vec3f(0.0);
      }
    }
  }
  p.velocity = vec4f(normal_v + tangent_v, p.velocity.w);
  return p;
}

fn collide_plane(p: Particle, b: vec4f, d: vec4f, particle_radius: f32) -> vec4f {
  let n = collider_safe_normalize(d.xyz, vec3f(0.0, 1.0, 0.0));
  let signed_dist = dot(p.position.xyz - b.xyz, n);
  let approach = max(0.0, -dot(p.velocity.xyz, n)) * g.dt;
  let contact_depth = max(particle_radius + approach, 0.0001);
  if (signed_dist < -contact_depth) {
    return vec4f(n, -1.0);
  }
  let penetration = particle_radius - signed_dist;
  return vec4f(n, penetration);
}

fn collide_sphere(p: Particle, b: vec4f, particle_radius: f32) -> vec4f {
  let delta = p.position.xyz - b.xyz;
  let dist = length(delta);
  let radius = max(0.0, b.w) + particle_radius;
  let penetration = radius - dist;
  let n = collider_safe_normalize(delta, vec3f(0.0, 1.0, 0.0));
  return vec4f(n, penetration);
}

fn collide_box(p: Particle, b: vec4f, c: vec4f, d: vec4f, e: vec4f, f: vec4f, particle_radius: f32) -> vec4f {
  let ax = collider_safe_normalize(c.xyz, vec3f(1.0, 0.0, 0.0));
  let ay = collider_safe_normalize(d.xyz, vec3f(0.0, 1.0, 0.0));
  let az = collider_safe_normalize(e.xyz, vec3f(0.0, 0.0, 1.0));
  let half_size = max(f.xyz * 0.5, vec3f(0.0001)) + vec3f(particle_radius);
  let delta = p.position.xyz - b.xyz;
  let local = vec3f(dot(delta, ax), dot(delta, ay), dot(delta, az));
  let q = abs(local) - half_size;
  if (max(max(q.x, q.y), q.z) > 0.0) {
    let outside = max(q, vec3f(0.0));
    let outside_dist = length(outside);
    if (outside_dist > particle_radius) {
      return vec4f(0.0, 1.0, 0.0, -1.0);
    }
    let world_out = ax * outside.x * sign(local.x) + ay * outside.y * sign(local.y) + az * outside.z * sign(local.z);
    return vec4f(collider_safe_normalize(world_out, vec3f(0.0, 1.0, 0.0)), particle_radius - outside_dist);
  }
  let px = half_size.x - abs(local.x);
  let py = half_size.y - abs(local.y);
  let pz = half_size.z - abs(local.z);
  if (px <= py && px <= pz) {
    return vec4f(ax * sign(local.x), px);
  }
  if (py <= pz) {
    return vec4f(ay * sign(local.y), py);
  }
  return vec4f(az * sign(local.z), pz);
}

fn apply_particle_colliders(p_in: Particle, slot: u32, response_mode: f32, radius_scale: f32, strength: f32) -> Particle {
  var p = p_in;
  let count = min(u32(particle_colliders.header.x), MAX_PARTICLE_COLLIDERS);
  let particle_radius = max(0.0, p.params.y) * radius_scale;
  for (var i = 0u; i < count; i = i + 1u) {
    let base = i * 6u;
    let a = particle_colliders.items[base];      // type, bounce, friction, stickiness
    let b = particle_colliders.items[base + 1u]; // position, radius
    let c = particle_colliders.items[base + 2u]; // x axis, settle speed
    let d = particle_colliders.items[base + 3u]; // y axis / plane normal
    let e = particle_colliders.items[base + 4u]; // z axis
    let f = particle_colliders.items[base + 5u]; // size

    var hit = vec4f(0.0, 1.0, 0.0, -1.0);
    if (a.x < 0.5) {
      hit = collide_plane(p, b, d, particle_radius);
    } else if (a.x < 1.5) {
      hit = collide_sphere(p, b, particle_radius);
    } else if (a.x < 2.5) {
      hit = collide_box(p, b, c, d, e, f, particle_radius);
    }
    if (hit.w > 0.0) {
      write_particle_event(EVENT_COLLISION, slot, i, particle_generation(p), length(p.velocity.xyz), p.position.xyz, p.velocity.xyz, hit.xyz);
    }
    let response = vec4f(c.w, a.y, a.z, a.w);
    p = collider_respond(p, hit.xyz, hit.w, response, response_mode, strength);
  }
  return p;
}
`;

function collectUniforms(modules: ModuleManifest[]): UniformDescriptor[] {
  const out: UniformDescriptor[] = [];
  const seen = new Set<string>();
  for (const m of modules) {
    for (const u of m.uniforms) {
      const key = `${m.id}.${u.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Prefix to avoid collisions across modules.
      out.push({ ...u, name: `${m.id}__${u.name}` });
    }
  }
  return out;
}

function collectLUTs(modules: ModuleManifest[]): LUTDescriptor[] {
  const out: LUTDescriptor[] = [];
  for (const m of modules) {
    for (const l of m.luts) {
      out.push({ ...l, name: `${m.id}__${l.name}` });
    }
  }
  return out;
}

const TYPE_SIZE: Record<UniformDescriptor['type'], number> = {
  f32: 4,
  u32: 4,
  i32: 4,
  vec2f: 8,
  vec3f: 12, // occupies 16 due to alignment
  vec4f: 16,
};

const TYPE_ALIGN: Record<UniformDescriptor['type'], number> = {
  f32: 4,
  u32: 4,
  i32: 4,
  vec2f: 8,
  vec3f: 16,
  vec4f: 16,
};

function packUniforms(uniforms: UniformDescriptor[]): {
  code: string;
  offsets: Map<string, number>;
  size: number;
} {
  const offsets = new Map<string, number>();
  let cursor = 0;
  const fields: string[] = [];
  for (const u of uniforms) {
    const align = TYPE_ALIGN[u.type];
    cursor = Math.ceil(cursor / align) * align;
    offsets.set(u.name, cursor);
    fields.push(`  ${u.name}: ${u.type},`);
    cursor += TYPE_SIZE[u.type];
  }
  // Round up to vec4 alignment for the struct itself.
  const size = Math.max(16, Math.ceil(cursor / 16) * 16);
  const code = fields.length
    ? `struct ModuleU {\n${fields.join('\n')}\n};\n@group(0) @binding(2) var<uniform> u: ModuleU;`
    : `struct ModuleU { _unused: f32, };\n@group(0) @binding(2) var<uniform> u: ModuleU;`;
  return { code, offsets, size };
}
