/**
 * Shared WGSL. Imported as a string and concatenated into emit/simulate/render shaders.
 *
 * Particle layout (80 bytes, 16-byte aligned for storage buffer access):
 *   position:    vec4f  // xyz position, w = total lifetime (0 means slot empty)
 *   velocity:    vec4f  // xyz velocity, w = age in seconds
 *   color:       vec4f  // rgba; reset to start_color each simulate step, then
 *                       // modulated by the colour/opacity modules (absolute per frame)
 *   params:      vec4f  // x=startSize, y=size, z=rotation, w=bitcast seed
 *   start_color: vec4f  // rgba captured at spawn; the immutable base for colour modules
 */
export const COMMON_WGSL = /* wgsl */ `
struct Particle {
  position: vec4f,
  velocity: vec4f,
  color: vec4f,
  params: vec4f,
  start_color: vec4f,
};

// PCG hash — fast, well-mixed, deterministic.
fn pcg(state: ptr<function, u32>) -> f32 {
  *state = *state * 747796405u + 2891336453u;
  var word = ((*state >> ((*state >> 28u) + 4u)) ^ *state) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967296.0;
}

fn rand_unit(state: ptr<function, u32>) -> f32 { return pcg(state); }

fn rand_range(state: ptr<function, u32>, lo: f32, hi: f32) -> f32 {
  return lo + (hi - lo) * pcg(state);
}

fn rand_sphere(state: ptr<function, u32>) -> vec3f {
  let u = pcg(state) * 2.0 - 1.0;
  let theta = pcg(state) * 6.2831853;
  let r = sqrt(max(0.0, 1.0 - u * u));
  return vec3f(r * cos(theta), r * sin(theta), u);
}

fn rand_disk(state: ptr<function, u32>) -> vec2f {
  let r = sqrt(pcg(state));
  let theta = pcg(state) * 6.2831853;
  return vec2f(r * cos(theta), r * sin(theta));
}

fn hash_u32(x: u32) -> u32 {
  var h = x;
  h ^= h >> 16u;
  h = h * 0x7feb352du;
  h ^= h >> 15u;
  h = h * 0x846ca68bu;
  h ^= h >> 16u;
  return h;
}

// Sample a Float32 curve LUT (texture_2d<f32>). Returns vec2f(min, max).
// LUT is res x 1; channel encoding is x=min, y=max.
fn sample_curve_lut(tex: texture_2d<f32>, t: f32) -> vec2f {
  let res = f32(textureDimensions(tex).x);
  let x = clamp(t, 0.0, 1.0) * (res - 1.0);
  let i0 = u32(floor(x));
  let i1 = min(i0 + 1u, u32(res) - 1u);
  let f = fract(x);
  let a = textureLoad(tex, vec2u(i0, 0u), 0).xy;
  let b = textureLoad(tex, vec2u(i1, 0u), 0).xy;
  return mix(a, b, f);
}

// Sample a gradient LUT (texture_2d<f32>, res x 2). Returns rgba lerped between min row and max row by r.
fn sample_gradient_lut(tex: texture_2d<f32>, t: f32, r: f32) -> vec4f {
  let dims = textureDimensions(tex);
  let res = f32(dims.x);
  let x = clamp(t, 0.0, 1.0) * (res - 1.0);
  let i0 = u32(floor(x));
  let i1 = min(i0 + 1u, u32(res) - 1u);
  let f = fract(x);
  let a0 = textureLoad(tex, vec2u(i0, 0u), 0);
  let a1 = textureLoad(tex, vec2u(i1, 0u), 0);
  let b0 = textureLoad(tex, vec2u(i0, 1u), 0);
  let b1 = textureLoad(tex, vec2u(i1, 1u), 0);
  let lo = mix(a0, a1, f);
  let hi = mix(b0, b1, f);
  return mix(lo, hi, clamp(r, 0.0, 1.0));
}
`;
