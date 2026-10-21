import {
  abs,
  dot,
  exp,
  float,
  floor,
  fract,
  mix,
  normalize,
  sin,
  smoothstep,
  step,
  vec3,
} from "../tsl";
import type { SkyNode } from "./material-uniforms";

// 3D hash → vec3 in [0,1). Stable per-cell seed for stars, nebula, dust.
function hash3d(p: SkyNode): SkyNode {
  const a: SkyNode = fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453123));
  const b: SkyNode = fract(sin(dot(p, vec3(269.5, 183.3, 246.1))).mul(22578.1459123));
  const c: SkyNode = fract(sin(dot(p, vec3(113.5, 271.9, 124.6))).mul(19642.3490217));
  return vec3(a, b, c);
}

// Smooth 3D value noise — trilinear interp between 8 cell-corner hashes.
function valueNoise3d(p: SkyNode): SkyNode {
  const i: SkyNode = floor(p);
  const f: SkyNode = fract(p);
  const u: SkyNode = f.mul(f).mul(float(3).sub(f.mul(2.0)));
  const c000: SkyNode = hash3d(i).x;
  const c100: SkyNode = hash3d(i.add(vec3(1, 0, 0))).x;
  const c010: SkyNode = hash3d(i.add(vec3(0, 1, 0))).x;
  const c110: SkyNode = hash3d(i.add(vec3(1, 1, 0))).x;
  const c001: SkyNode = hash3d(i.add(vec3(0, 0, 1))).x;
  const c101: SkyNode = hash3d(i.add(vec3(1, 0, 1))).x;
  const c011: SkyNode = hash3d(i.add(vec3(0, 1, 1))).x;
  const c111: SkyNode = hash3d(i.add(vec3(1, 1, 1))).x;
  const x00: SkyNode = mix(c000, c100, u.x);
  const x10: SkyNode = mix(c010, c110, u.x);
  const x01: SkyNode = mix(c001, c101, u.x);
  const x11: SkyNode = mix(c011, c111, u.x);
  const y0: SkyNode = mix(x00, x10, u.y);
  const y1: SkyNode = mix(x01, x11, u.y);
  return mix(y0, y1, u.z);
}

function fbm3d(p: SkyNode): SkyNode {
  const n1: SkyNode = valueNoise3d(p);
  const n2: SkyNode = valueNoise3d(p.mul(2.07).add(vec3(7.13)));
  const n3: SkyNode = valueNoise3d(p.mul(4.19).add(vec3(13.7)));
  return n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2));
}

function starsLayer(
  dir: SkyNode,
  scale: number,
  density: number,
  sizeMin: number,
  sizeMax: number,
  brightness: number,
  sizeMul: SkyNode,
): SkyNode {
  const p = dir.mul(scale);
  const cell = floor(p);
  const local: SkyNode = fract(p);
  const seed: SkyNode = hash3d(cell);
  const offset: SkyNode = seed.mul(0.6).add(0.2);
  const delta: SkyNode = local.sub(offset);
  const dist2: SkyNode = dot(delta, delta);
  const sigma: SkyNode = mix(float(sizeMin), float(sizeMax), seed.x.mul(seed.x)).mul(sizeMul);
  const sigma2: SkyNode = sigma.mul(sigma).add(0.000001);
  const glow: SkyNode = exp(dist2.div(sigma2).negate());
  const core: SkyNode = exp(dist2.div(sigma2.mul(0.18)).negate()).mul(2.4);
  const body: SkyNode = glow.add(core);
  const exists: SkyNode = step(float(1.0 - density), seed.y);
  const temp: SkyNode = seed.z;
  const cool: SkyNode = mix(
    vec3(0.66, 0.78, 1.0),
    vec3(1.0, 0.98, 0.94),
    smoothstep(0.0, 0.35, temp),
  );
  const warm: SkyNode = mix(
    vec3(1.0, 0.86, 0.62),
    vec3(1.0, 0.52, 0.30),
    smoothstep(0.65, 1.0, temp),
  );
  const starColor: SkyNode = mix(cool, warm, smoothstep(0.3, 0.7, temp));
  const bright: SkyNode = mix(float(0.4), float(1.0), seed.x);
  return starColor.mul(body).mul(exists).mul(bright).mul(float(brightness));
}

/** Builds the night-sky milky-way, dust, and three star layers. */
export function starField(
  dir: SkyNode,
  night: SkyNode,
  starsIntensity: SkyNode,
  starsSize: SkyNode,
  galaxyIntensity: SkyNode,
): SkyNode {
  const galacticNormal: SkyNode = normalize(vec3(0.36, 0.22, 0.91));
  const distToPlane: SkyNode = abs(dot(dir, galacticNormal));
  const bandHalo: SkyNode = float(1).sub(smoothstep(0.0, 0.38, distToPlane));
  const bandCore: SkyNode = float(1).sub(smoothstep(0.0, 0.10, distToPlane));

  const nebP: SkyNode = dir.mul(2.4);
  const nebDensity: SkyNode = fbm3d(nebP);
  const nebDensity2: SkyNode = fbm3d(dir.mul(5.7).add(vec3(31.0)));
  const nebColorMix: SkyNode = fbm3d(dir.mul(1.6).add(vec3(53.0)));
  const colorBlue = vec3(0.18, 0.26, 0.52);
  const colorMagenta = vec3(0.46, 0.20, 0.40);
  const colorWarm = vec3(0.55, 0.34, 0.22);
  const colorPurple = vec3(0.24, 0.16, 0.36);
  const nebulaTint: SkyNode = mix(
    mix(colorBlue, colorMagenta, smoothstep(0.3, 0.7, nebColorMix)),
    mix(colorWarm, colorPurple, smoothstep(0.4, 0.8, nebDensity2)),
    smoothstep(0.25, 0.75, nebDensity),
  );

  const dust: SkyNode = smoothstep(0.42, 0.78, fbm3d(dir.mul(4.3).add(vec3(91.0))));
  const dustMask: SkyNode = dust.mul(bandCore);
  const ambientGlow: SkyNode = bandHalo.mul(0.015);
  const denseGlow: SkyNode = nebDensity.mul(nebDensity).mul(bandHalo).mul(0.084);
  const coreGlow: SkyNode = nebDensity.mul(bandCore).mul(0.132);
  const milkyWay: SkyNode = nebulaTint
    .mul(ambientGlow.add(denseGlow).add(coreGlow))
    .mul(float(1).sub(dustMask.mul(0.7)));

  const brightStars: SkyNode = starsLayer(dir, 200.0, 0.008, 0.10, 0.24, 1.6, starsSize);
  const fieldStars: SkyNode = starsLayer(dir, 460.0, 0.018, 0.05, 0.11, 0.55, starsSize);
  const bandBoost: SkyNode = bandCore.mul(1.6).add(bandHalo.mul(0.4)).add(0.2);
  const bandStars: SkyNode = starsLayer(dir, 300.0, 0.028, 0.05, 0.13, 0.7, starsSize)
    .mul(bandBoost);
  const stars: SkyNode = brightStars.add(fieldStars).add(bandStars).mul(starsIntensity);
  const occlusion: SkyNode = float(1).sub(dustMask.mul(0.55));
  return milkyWay.mul(galaxyIntensity).add(stars.mul(occlusion)).mul(night);
}
