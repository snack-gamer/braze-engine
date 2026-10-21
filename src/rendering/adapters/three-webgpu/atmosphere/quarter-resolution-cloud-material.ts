import {
  Fn,
  clamp,
  exp,
  float,
  getViewPosition,
  mix,
  normalize,
  pow,
  saturate,
  smoothstep,
  uv,
  vec4,
} from "../../../../three/tsl";
import { cloudsLayer } from "../../../../three/sky/cloud-nodes";
import type { SkyMaterialUniforms, SkyNode } from "../../../../three/sky/material-uniforms";

/** Builds an RGBA cloud contribution: fogged linear color plus authored opacity. */
export function createQuarterResolutionCloudContribution(
  uniforms: SkyMaterialUniforms,
  cameraWorldMatrix: SkyNode,
  cameraProjectionMatrixInverse: SkyNode,
): SkyNode {
  return Fn(() => {
    const viewPosition = getViewPosition(uv(), float(0.5), cameraProjectionMatrixInverse);
    const direction = normalize(cameraWorldMatrix.mul(vec4(viewPosition, 0)).xyz);
    const sunDirection = normalize(uniforms.sunDirection);
    const sunY = sunDirection.y;
    const twilight: SkyNode = smoothstep(-0.22, 0.08, sunY).mul(
      float(1).sub(smoothstep(0.05, 0.32, sunY)),
    );
    const night = float(1).sub(smoothstep(-0.18, 0.035, sunY));
    const clouds = cloudsLayer(
      direction,
      sunDirection,
      sunY,
      twilight,
      night,
      uniforms.cloudsCoverage,
      uniforms.cloudsDensity,
      uniforms.cloudsDepth,
      uniforms.cloudsScale,
      uniforms.cloudsDetail,
      uniforms.cloudsComplexity,
      uniforms.cloudsContrast,
      uniforms.cloudsWarp,
      uniforms.cloudsBillow,
      uniforms.cloudsStreaks,
      uniforms.cloudsErosion,
      uniforms.cloudsWeather,
      uniforms.cloudsTopVariation,
      uniforms.cloudsAbsorption,
      uniforms.cloudsScattering,
      uniforms.cloudsSelfShadow,
      uniforms.cloudsShadowStrength,
      uniforms.cloudsShadowDetail,
      uniforms.cloudsSpeed,
    );
    const cloudColor = fogCloudColor(clouds.xyz.mul(uniforms.exposure), direction.y, uniforms);
    return vec4(cloudColor, clouds.w);
  })();
}

function fogCloudColor(color: SkyNode, directionY: SkyNode, uniforms: SkyMaterialUniforms): SkyNode {
  const coverage = clamp(uniforms.fogSkyCoverage, 0.0, 2.0);
  const height = clamp(uniforms.fogSkyHeight, 0.0, 1.0);
  const softness = clamp(uniforms.fogSkySoftness, 0.0, 1.0);
  const fogDepth = uniforms.atmosphericFogDensity.mul(
    mix(float(260.0), float(980.0), coverage.mul(0.5)),
  );
  const presence = saturate(
    float(1).sub((exp as SkyNode)(fogDepth.mul(fogDepth).negate())),
  );
  const top = mix(float(0.20), float(1.05), height);
  const base = mix(float(-0.06), float(-0.30), softness);
  const band = float(1).sub(smoothstep(base, top, directionY));
  const shape = pow(band, mix(float(0.34), float(0.86), softness));
  const mask = saturate(
    shape.mul(presence).mul(mix(float(0.0), float(1.65), coverage)),
  );
  return mix(color, uniforms.atmosphericFogColor, mask);
}
