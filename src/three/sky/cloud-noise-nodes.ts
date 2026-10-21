import {
  clamp,
  dot,
  float,
  floor,
  fract,
  length,
  min,
  mix,
  saturate,
  vec2,
  vec3,
} from "../tsl";
import type { SkyNode } from "./material-uniforms";

/**
 * Dave Hoskins-style hash-without-sine for a 2D lattice coordinate.
 *
 * The former dot/sine hash expanded to 504 transcendental evaluations for
 * every cloud pixel. This hash uses only multiply, add, dot and fract, which
 * map to ordinary floating-point ALU on WebGPU while retaining deterministic
 * decorrelation for the value-noise and Worley lattices.
 */
export function cloudHash2d(p: SkyNode): SkyNode {
  const seed = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const mixed = seed.add(dot(seed, seed.yzx.add(33.33)));
  return fract(mixed.x.add(mixed.y).mul(mixed.z));
}

export function valueNoise2d(p: SkyNode): SkyNode {
  const i: SkyNode = floor(p);
  const f: SkyNode = fract(p);
  const u: SkyNode = f.mul(f).mul(float(3).sub(f.mul(2.0)));
  const a: SkyNode = cloudHash2d(i);
  const b: SkyNode = cloudHash2d(i.add(vec2(1, 0)));
  const c: SkyNode = cloudHash2d(i.add(vec2(0, 1)));
  const d: SkyNode = cloudHash2d(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

export function fbm2d(p: SkyNode): SkyNode {
  const n1: SkyNode = valueNoise2d(p);
  const n2: SkyNode = valueNoise2d(p.mul(2.07).add(vec2(7.13)));
  const n3: SkyNode = valueNoise2d(p.mul(4.19).add(vec2(13.7)));
  return n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2));
}

export function worley2d(p: SkyNode): SkyNode {
  const cell: SkyNode = floor(p);
  const local: SkyNode = fract(p);
  let dist: SkyNode = float(8.0);
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [0, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  for (const [ox, oy] of offsets) {
    const offset = vec2(ox, oy);
    const neighbor: SkyNode = cell.add(offset);
    const feature = offset.add(vec2(
      cloudHash2d(neighbor.add(vec2(17.1, 11.7))),
      cloudHash2d(neighbor.add(vec2(43.2, 91.7))),
    ));
    dist = min(dist, length(feature.sub(local)));
  }
  return saturate(dist);
}

export function warpedCloudPoint(
  p: SkyNode,
  warp: SkyNode,
  complexity: SkyNode,
): SkyNode {
  const warp01 = clamp(warp, 0.0, 1.0);
  const complexity01 = clamp(complexity, 0.0, 1.0);
  const low = p.mul(0.44);
  const wx: SkyNode = fbm2d(low.add(vec2(23.7, 5.1))).sub(0.5);
  const wy: SkyNode = fbm2d(low.add(vec2(7.4, 39.6))).sub(0.5);
  const medium: SkyNode = valueNoise2d(
    p.mul(mix(float(0.82), float(1.65), complexity01)).add(vec2(51.2, 13.8)),
  ).sub(0.5);
  const amount: SkyNode = mix(float(0.0), float(1.55), warp01);
  return p.add(vec2(wx.add(medium.mul(0.34)), wy.sub(medium.mul(0.28))).mul(amount));
}
