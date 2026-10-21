import * as THREE from "three";
import type { SkySettings } from "../../../types";

export type GodraysParameters = Readonly<{
  raymarchSteps: number;
  radialDensity: number;
  strength: number;
  decay: number;
}>;

/** Maps authored controls to a bounded half-resolution raymarch budget. */
export function resolveGodraysParameters(settings: SkySettings): GodraysParameters {
  const intensity = THREE.MathUtils.clamp(settings.godraysIntensity, 0, 3) / 3;
  const spread = THREE.MathUtils.clamp(settings.godraysSpread, 0.05, 1);
  const decay = THREE.MathUtils.clamp(settings.godraysDecay, 0, 1);
  return {
    raymarchSteps: Math.round(THREE.MathUtils.lerp(16, 28, spread)),
    radialDensity: THREE.MathUtils.lerp(0.38, 1.18, spread),
    strength: THREE.MathUtils.lerp(0.08, 0.82, intensity),
    decay: THREE.MathUtils.lerp(0.9, 0.985, decay),
  };
}
