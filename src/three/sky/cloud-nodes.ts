import {
  abs,
  clamp,
  dot,
  exp,
  float,
  fwidth,
  length,
  max,
  mix,
  normalize,
  pow,
  saturate,
  smoothstep,
  time,
  vec2,
  vec3,
  vec4,
} from "../tsl";
import type { SkyNode } from "./material-uniforms";
import { fbm2d, valueNoise2d, warpedCloudPoint, worley2d } from "./cloud-noise-nodes";

const CLOUD_VOLUME_SLICES = [
  { h: 0.14, weight: 0.62, phaseX: 2.10, phaseY: 7.40 },
  { h: 0.34, weight: 1.00, phaseX: 2.22, phaseY: 7.31 },
  { h: 0.58, weight: 0.92, phaseX: 2.35, phaseY: 7.50 },
  { h: 0.82, weight: 0.50, phaseX: 2.47, phaseY: 7.36 },
] as const;

export const CLOUD_VOLUME_SLICE_COUNT = CLOUD_VOLUME_SLICES.length;

function cloudShapeField(
  p: SkyNode,
  windDir: SkyNode,
  crossDir: SkyNode,
  scale: SkyNode,
  detail: SkyNode,
  complexity: SkyNode,
  contrast: SkyNode,
  warp: SkyNode,
  billow: SkyNode,
  streaks: SkyNode,
  erosion: SkyNode,
): SkyNode {
  const cloudScale = clamp(scale, 0.08, 8.0);
  const detailControl = clamp(detail, 0.0, 2.0);
  const detail01 = saturate(detailControl);
  const detailOverdrive: SkyNode = smoothstep(1.0, 2.0, detailControl);
  const complexity01 = clamp(complexity, 0.0, 1.0);
  const contrastControl = clamp(contrast, 0.0, 2.0);
  const contrast01 = saturate(contrastControl);
  const contrastOverdrive: SkyNode = smoothstep(1.0, 2.0, contrastControl);
  const billow01 = clamp(billow, 0.0, 1.0);
  const streaks01 = clamp(streaks, 0.0, 1.0);
  const erosion01 = clamp(erosion, 0.0, 1.0);
  const q: SkyNode = warpedCloudPoint(p.div(cloudScale), warp, complexity01);

  const macro: SkyNode = fbm2d(q.mul(mix(float(0.58), float(1.12), complexity01)).add(vec2(2.1, 7.4)));
  const macro2: SkyNode = fbm2d(q.mul(mix(float(1.05), float(2.10), complexity01)).add(vec2(18.6, 2.8)));
  const cellDist: SkyNode = worley2d(q.mul(mix(float(0.46), float(0.92), complexity01)).add(vec2(5.3, 1.7)));
  const puffCell: SkyNode = pow(
    saturate(float(1).sub(cellDist.mul(mix(float(1.75), float(1.25), billow01)))),
    mix(float(2.6), float(0.82), billow01),
  );
  const roundedNoise: SkyNode = fbm2d(q.mul(mix(float(1.05), float(1.95), complexity01)).add(vec2(13.2, 8.4)));
  const billowField: SkyNode = pow(
    saturate(float(1).sub(abs(roundedNoise.mul(2.0).sub(1.0)))),
    mix(float(2.20), float(0.64), billow01),
  );

  const along: SkyNode = dot(q, windDir);
  const across: SkyNode = dot(q, crossDir);
  const streakCoord = vec2(
    along.mul(mix(float(0.62), float(0.13), streaks01)),
    across.mul(mix(float(0.74), float(3.85), streaks01)),
  );
  const streakNoise: SkyNode = fbm2d(streakCoord.add(vec2(11.7, 4.1)));
  const streakRidge: SkyNode = float(1).sub(abs(streakNoise.mul(2.0).sub(1.0)));
  const streakField: SkyNode = mix(streakNoise, streakRidge, streaks01.mul(0.72));

  const detailFreq: SkyNode = mix(float(2.2), float(12.0), detail01)
    .mul(mix(float(1.0), float(2.0), detailOverdrive));
  const fineA: SkyNode = fbm2d(q.mul(detailFreq).add(vec2(41.2, 19.7)));
  const fineB: SkyNode = valueNoise2d(q.mul(detailFreq.mul(1.83)).add(vec2(6.2, 18.4)));
  const fineC: SkyNode = valueNoise2d(q.mul(detailFreq.mul(3.71)).add(vec2(31.8, 4.6)));
  const edgeGrain: SkyNode = fineA.mul(0.52)
    .add(fineB.mul(0.34))
    .add(fineC.mul(detailOverdrive).mul(0.24));

  const puffy: SkyNode = puffCell.mul(0.92).add(billowField.mul(0.34)).add(macro.sub(0.5).mul(0.20));
  const rounded: SkyNode = mix(
    macro.mul(0.70).add(macro2.mul(0.30)),
    puffy,
    saturate(billow01.mul(0.88).add(0.18)),
  );
  const directional: SkyNode = mix(
    rounded,
    streakField.mul(0.72).add(rounded.mul(0.34)),
    streaks01,
  );
  const eroded: SkyNode = directional.sub(
    edgeGrain.mul(erosion01).mul(
      mix(float(0.08), float(0.42), detail01).mul(
        mix(float(1.0), float(1.65), detailOverdrive),
      ),
    ),
  );
  const contrastStrength: SkyNode = mix(float(0.68), float(2.65), contrast01)
    .mul(mix(float(1.0), float(1.75), contrastOverdrive));
  const contrasted: SkyNode = eroded.sub(0.5).mul(contrastStrength).add(0.5);
  return saturate(contrasted);
}

/** Builds the world-space pseudo-volume cloud slab and its lighting response. */
export function cloudsLayer(
  dir: SkyNode,
  sunDir: SkyNode,
  sunY: SkyNode,
  twilight: SkyNode,
  night: SkyNode,
  coverage: SkyNode,
  density: SkyNode,
  depth: SkyNode,
  scale: SkyNode,
  detail: SkyNode,
  complexity: SkyNode,
  contrast: SkyNode,
  warp: SkyNode,
  billow: SkyNode,
  streaks: SkyNode,
  erosion: SkyNode,
  weatherAmount: SkyNode,
  topVariation: SkyNode,
  absorption: SkyNode,
  scattering: SkyNode,
  selfShadow: SkyNode,
  shadowStrength: SkyNode,
  shadowDetail: SkyNode,
  speed: SkyNode,
): SkyNode {
  const cov: SkyNode = clamp(coverage, 0.0, 1.0);
  const density01 = clamp(density, 0.0, 1.0);
  const depth01 = clamp(depth, 0.0, 1.0);
  const complexity01 = clamp(complexity, 0.0, 1.0);
  const contrastControl = clamp(contrast, 0.0, 2.0);
  const contrast01 = saturate(contrastControl);
  const billow01 = clamp(billow, 0.0, 1.0);
  const streaks01 = clamp(streaks, 0.0, 1.0);
  const erosion01 = clamp(erosion, 0.0, 1.0);
  const weather01 = clamp(weatherAmount, 0.0, 1.0);
  const topVariation01 = clamp(topVariation, 0.0, 1.0);
  const absorptionControl = clamp(absorption, 0.0, 2.0);
  const scatteringControl = clamp(scattering, 0.0, 2.0);
  const scattering01 = saturate(scatteringControl);
  const scatteringOverdrive: SkyNode = smoothstep(1.0, 2.0, scatteringControl);
  const selfShadowControl = clamp(selfShadow, 0.0, 2.0);
  const selfShadowOverdrive: SkyNode = smoothstep(1.0, 2.0, selfShadowControl);
  const shadowStrengthControl = clamp(shadowStrength, 0.0, 2.0);
  const shadowStrength01 = saturate(shadowStrengthControl);
  const shadowDetailControlInput = clamp(shadowDetail, 0.0, 2.0);
  const shadowDetail01 = saturate(shadowDetailControlInput);

  const windDir: SkyNode = normalize(sunDir.xz.add(vec2(0.24, 0.11)));
  const crossDir: SkyNode = normalize(vec2(windDir.y.negate(), windDir.x));
  const dayLight: SkyNode = smoothstep(-0.03, 0.46, sunY);
  const sunVisible: SkyNode = smoothstep(-0.06, 0.16, sunY);
  const t: SkyNode = time.mul(speed.mul(0.022));
  const drift: SkyNode = windDir.mul(t.mul(8.0)).add(crossDir.mul(t.mul(1.4)));
  const rayY: SkyNode = max(dir.y, 0.045);
  const layerBottom: SkyNode = mix(float(0.42), float(0.88), depth01);
  const layerThickness: SkyNode = mix(float(0.32), float(1.95), depth01);
  const worldScale: SkyNode = mix(float(0.28), float(0.16), depth01);
  const altitudeFade: SkyNode = smoothstep(0.015, 0.115, dir.y)
    .mul(float(1).sub(smoothstep(0.96, 1.0, dir.y).mul(0.20)));
  const coverGate: SkyNode = smoothstep(0.015, 0.12, cov);
  const softnessBase: SkyNode = mix(float(0.15), float(0.045), contrast01)
    .mul(mix(float(1.24), float(0.74), density01));
  const invSliceWeight = float(1 / 3.04);
  let densityAccum: SkyNode = float(0.0);
  let edgeAccum: SkyNode = float(0.0);
  let lowerMass: SkyNode = float(0.0);
  let upperMass: SkyNode = float(0.0);
  let crownLightAccum: SkyNode = float(0.0);

  for (const slice of CLOUD_VOLUME_SLICES) {
    const h = float(slice.h);
    const sliceAltitude: SkyNode = layerBottom.add(layerThickness.mul(h));
    const worldP: SkyNode = dir.xz.mul(sliceAltitude.div(rayY)).mul(worldScale)
      .add(drift)
      .add(windDir.mul(h.mul(mix(float(0.10), float(0.48), topVariation01))))
      .add(vec2(slice.phaseX, slice.phaseY));
    const dist: SkyNode = length(worldP.sub(drift));
    const distanceFade: SkyNode = float(1).sub(smoothstep(7.5, 24.0, dist));
    const weather: SkyNode = fbm2d(worldP.mul(0.18).add(vec2(0.37, 0.61)));
    const localCoverage: SkyNode = clamp(
      cov.add(weather.sub(0.5).mul(weather01).mul(mix(float(0.16), float(0.58), float(1).sub(cov)))),
      0.0,
      1.0,
    );
    const shape = cloudShapeField(
      worldP,
      windDir,
      crossDir,
      scale,
      detail,
      complexity01,
      contrastControl,
      warp,
      billow01,
      streaks01,
      erosion01,
    );
    const effectiveCoverage: SkyNode = saturate(
      localCoverage.mul(mix(float(0.78), float(1.15), density01)),
    );
    const threshold: SkyNode = mix(float(0.78), float(0.24), effectiveCoverage);
    // Widen subpixel thresholds at grazing angles before the reduced cloud
    // target is reconstructed; otherwise fine noise aliases into blocky bands.
    const softness = max(softnessBase, fwidth(shape).mul(0.75));
    const body: SkyNode = smoothstep(threshold.sub(softness), threshold.add(softness), shape);
    const edge: SkyNode = smoothstep(
      threshold.sub(softness.mul(2.3)),
      threshold.add(softness.mul(1.45)),
      shape,
    );
    const heightEnvelope: SkyNode = smoothstep(0.00, 0.22, h)
      .mul(float(1).sub(smoothstep(0.78, 1.0, h)));
    const d: SkyNode = body.mul(heightEnvelope).mul(distanceFade).mul(float(slice.weight));
    const upperSliceMask: SkyNode = smoothstep(0.42, 0.90, h);
    const sliceCrownLight: SkyNode = d.mul(upperSliceMask).mul(sunVisible);
    densityAccum = densityAccum.add(d);
    edgeAccum = edgeAccum.add(edge.mul(heightEnvelope).mul(distanceFade).mul(float(slice.weight)));
    lowerMass = lowerMass.add(d.mul(float(1).sub(smoothstep(0.24, 0.58, h))));
    upperMass = upperMass.add(d.mul(smoothstep(0.38, 0.86, h)));
    crownLightAccum = crownLightAccum.add(sliceCrownLight);
  }

  const body: SkyNode = saturate(densityAccum.mul(invSliceWeight));
  const edge: SkyNode = saturate(edgeAccum.mul(invSliceWeight));
  const lowerBody: SkyNode = saturate(lowerMass.mul(invSliceWeight).mul(1.85));
  const upperBody: SkyNode = saturate(upperMass.mul(invSliceWeight).mul(1.65));
  const columnCrownLight: SkyNode = saturate(crownLightAccum.mul(invSliceWeight).mul(2.0));
  const alpha: SkyNode = saturate(
    pow(body, mix(float(1.35), float(0.68), density01))
      .mul(mix(float(0.28), float(1.08), density01))
      .mul(altitudeFade)
      .mul(coverGate),
  );

  const sunFacing: SkyNode = saturate(dot(dir, sunDir));
  const lowSun: SkyNode = float(1).sub(smoothstep(0.08, 0.58, sunY));
  const goldenLight: SkyNode = saturate(twilight.add(lowSun.mul(dayLight).mul(0.42)));
  const opticalMass: SkyNode = edge.mul(mix(float(0.85), float(3.75), density01))
    .mul(mix(float(0.70), float(1.65), depth01));
  const topCrownLight: SkyNode = saturate(
    upperBody.add(columnCrownLight)
      .mul(float(1).sub(lowerBody.mul(0.45)))
      .mul(smoothstep(-0.04, 0.42, sunY)),
  );
  const selfOcclusion: SkyNode = saturate(
    float(1).sub((exp as SkyNode)(opticalMass.mul(selfShadowControl).mul(-2.20))),
  );
  const undersideView: SkyNode = float(1).sub(smoothstep(0.28, 0.82, dir.y));
  const undersideMask: SkyNode = saturate(
    lowerBody.mul(1.75).add(edge.mul(0.48)).mul(float(1).sub(topCrownLight.mul(0.42))),
  );
  const columnSelfShadow: SkyNode = saturate(
    undersideMask
      .mul(upperBody.mul(mix(float(1.10), float(4.20), shadowDetailControlInput)).add(body.mul(0.38)))
      .mul(undersideView)
      .mul(sunVisible)
      .mul(mix(float(0.0), float(4.35), selfShadowControl))
      .mul(mix(float(1.0), float(2.05), selfShadowOverdrive)),
  );
  const undersideCast: SkyNode = saturate(
    columnSelfShadow.mul(mix(float(1.00), float(2.35), shadowStrength01)),
  );
  const coreShadow: SkyNode = saturate(
    undersideCast.add(
      selfOcclusion
        .mul(mix(float(0.18), float(1.05), selfShadowControl))
        .mul(mix(float(1.0), float(1.55), selfShadowOverdrive)),
    ),
  );
  const shadowAmount: SkyNode = saturate(
    coreShadow
      .mul(mix(float(0.55), float(3.35), shadowStrengthControl))
      .mul(mix(float(0.65), float(1.25), alpha)),
  );
  const lightGap: SkyNode = saturate(
    topCrownLight
      .mul(mix(float(0.28), float(1.25), shadowDetail01))
      .mul(float(1).sub(shadowAmount.mul(0.58))),
  );
  const rimLight: SkyNode = pow(sunFacing, mix(float(12.0), float(1.65), scattering01))
    .mul(sunVisible)
    .mul(saturate(float(1).sub(body).add(lightGap.mul(0.85))))
    .mul(
      mix(float(0.10), float(2.25), scatteringControl)
        .mul(mix(float(1.0), float(1.65), scatteringOverdrive)),
    );
  const directLight: SkyNode = saturate(
    dayLight.mul(0.22)
      .add(topCrownLight.mul(0.62))
      .add(lightGap.mul(mix(float(0.30), float(0.82), shadowDetail01)))
      .add(sunFacing.mul(0.10))
      .add(rimLight.mul(0.58))
      .sub(shadowAmount.mul(mix(float(0.18), float(0.74), shadowStrength01))),
  );

  const cloudShadow: SkyNode = mix(vec3(0.08, 0.12, 0.23), vec3(0.014, 0.018, 0.040), night);
  const cloudMid: SkyNode = mix(vec3(0.58, 0.66, 0.80), vec3(0.08, 0.10, 0.17), night);
  const cloudLit: SkyNode = mix(
    mix(vec3(1.12, 1.12, 1.04), vec3(1.18, 0.70, 0.38), goldenLight),
    vec3(0.13, 0.15, 0.24),
    night,
  );
  let cloudColor: SkyNode = mix(
    cloudShadow,
    cloudMid,
    mix(float(0.22), float(0.56), dayLight),
  );
  cloudColor = mix(cloudColor, cloudLit, directLight);
  cloudColor = mix(cloudColor, cloudShadow, shadowAmount);
  cloudColor = cloudColor.add(
    cloudLit.mul(topCrownLight).mul(float(0.28)).mul(float(1).sub(shadowAmount.mul(0.55))),
  );
  cloudColor = cloudColor.mul(
    float(1).sub(
      absorptionControl
        .mul(edge)
        .mul(mix(float(0.16), float(0.76), shadowStrength01))
        .mul(mix(float(0.75), float(1.55), density01)),
    ),
  );
  const rimColor: SkyNode = mix(
    vec3(1.0, 0.95, 0.78),
    vec3(1.0, 0.55, 0.26),
    goldenLight,
  )
    .mul(rimLight.mul(edge.add(0.18)).mul(mix(float(0.45), float(1.55), scatteringControl)))
    .mul(float(1).sub(night.mul(0.78)));
  return vec4(cloudColor.add(rimColor), alpha);
}
