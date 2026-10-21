import * as THREE from "three";
import { resolveWaterSettings } from "../../water/settings";
import type { WaterSettings } from "../../water/types";

const TAU = Math.PI * 2;
const GRAVITY = 9.81;

type OceanSample = {
  height: number;
  normal: THREE.Vector3;
  slope: number;
};

const tmpWind = new THREE.Vector2();
const tmpPerp = new THREE.Vector2();

function mixDir(a: THREE.Vector2, b: THREE.Vector2, t: number): THREE.Vector2 {
  return new THREE.Vector2(
    THREE.MathUtils.lerp(a.x, b.x, t),
    THREE.MathUtils.lerp(a.y, b.y, t),
  ).normalize();
}

function addGerstnerWave(
  p: THREE.Vector2,
  dir: THREE.Vector2,
  amplitude: number,
  steepness: number,
  wavelength: number,
  speed: number,
  time: number,
  disp: THREE.Vector3,
  dxAccum: THREE.Vector3,
  dzAccum: THREE.Vector3,
): void {
  if (amplitude < 0.0001) return;
  const k = TAU / wavelength;
  const q = Math.min(steepness, 0.95 / Math.max(k * amplitude, 0.001));
  const omega = Math.sqrt(GRAVITY * k) * speed;
  const phase = k * dir.dot(p) - omega * time;
  const sf = Math.sin(phase);
  const cf = Math.cos(phase);
  const horiz = q * amplitude;

  disp.x += dir.x * horiz * cf;
  disp.z += dir.y * horiz * cf;
  disp.y += amplitude * sf;

  const kA = k * amplitude;
  const qkA = q * kA;
  dxAccum.x += -dir.x * dir.x * qkA * sf;
  dxAccum.y += dir.x * kA * cf;
  dxAccum.z += -dir.x * dir.y * qkA * sf;

  dzAccum.x += -dir.x * dir.y * qkA * sf;
  dzAccum.y += dir.y * kA * cf;
  dzAccum.z += -dir.y * dir.y * qkA * sf;
}

export function sampleOcean(settingsInput: Partial<WaterSettings> | undefined, x: number, z: number, elapsed: number): OceanSample {
  const settings = resolveWaterSettings(settingsInput);
  const time = elapsed * settings.waveSpeed;
  const windDirection = THREE.MathUtils.degToRad(settings.windDirection);
  tmpWind.set(Math.cos(windDirection), Math.sin(windDirection));
  tmpPerp.set(-tmpWind.y, tmpWind.x);

  const p = new THREE.Vector2(x, z);
  const disp = new THREE.Vector3();
  const dxAccum = new THREE.Vector3();
  const dzAccum = new THREE.Vector3();

  const swellScale = Math.max(settings.waveScale, 0.1);
  const swellHeight = THREE.MathUtils.clamp(settings.waveHeight, 0, 5);
  const swellChop = THREE.MathUtils.clamp(settings.distortion / 18, 0, 1);
  const q = THREE.MathUtils.lerp(0, 0.55, swellChop);

  const chopFreq = Math.max(settings.chopScale, 0.2);
  const chopStrength = THREE.MathUtils.clamp(settings.chopStrength, 0, 1.5);
  const chopHeightM = THREE.MathUtils.clamp(settings.chopHeight, 0, 3) * chopStrength;

  const negWind = tmpWind.clone().multiplyScalar(-1);
  const negPerp = tmpPerp.clone().multiplyScalar(-1);
  const d1 = mixDir(tmpWind, tmpPerp, 0.08);
  const d2 = mixDir(tmpWind, negPerp, 0.31);
  const d3 = mixDir(negPerp, tmpWind, 0.22);
  const d4 = mixDir(tmpPerp, tmpWind, 0.62);
  const d5 = mixDir(tmpWind, negPerp, 0.55);
  const d6 = mixDir(negWind, tmpPerp, 0.41);

  addGerstnerWave(p, d1, swellHeight * 0.55, q, 26.0 / swellScale, 1.0, time, disp, dxAccum, dzAccum);
  addGerstnerWave(p, d2, swellHeight * 0.30, q, 13.0 / swellScale, 1.05, time, disp, dxAccum, dzAccum);
  addGerstnerWave(p, d3, swellHeight * 0.15, q, 6.5 / swellScale, 1.12, time, disp, dxAccum, dzAccum);
  addGerstnerWave(p, d4, chopHeightM * 0.44, q, 3.40 / (swellScale * chopFreq), 1.22, time, disp, dxAccum, dzAccum);
  addGerstnerWave(p, d5, chopHeightM * 0.33, q, 1.85 / (swellScale * chopFreq), 1.32, time, disp, dxAccum, dzAccum);
  addGerstnerWave(p, d6, chopHeightM * 0.23, q, 0.95 / (swellScale * chopFreq), 1.45, time, disp, dxAccum, dzAccum);

  const tangent = new THREE.Vector3(1 + dxAccum.x, dxAccum.y, dxAccum.z);
  const bitangent = new THREE.Vector3(dzAccum.x, dzAccum.y, 1 + dzAccum.z);
  const normal = new THREE.Vector3().crossVectors(bitangent, tangent).normalize();

  return {
    height: disp.y,
    normal,
    slope: THREE.MathUtils.clamp(new THREE.Vector2(dxAccum.y, dzAccum.y).length(), 0, 2),
  };
}
