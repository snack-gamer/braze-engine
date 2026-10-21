import * as THREE from "three";
import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  acos,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  saturate,
  smoothstep,
  vec3,
  vec4,
} from "../tsl";
import type { SkyMaterialUniforms, SkyNode } from "./material-uniforms";
import { starField } from "./star-nodes";

/** Composes the physical atmosphere, celestial field, and sky fog. */
export function createSkyMaterial(uniforms: SkyMaterialUniforms): NodeMaterial {
  const material = new NodeMaterial();
  material.side = THREE.BackSide;
  material.depthWrite = false;
  material.depthTest = false;
  material.fog = false;
  material.lights = false;
  material.toneMapped = true;

  material.colorNode = Fn(() => {
    const dir = normalize(positionWorld.sub(cameraPosition));
    const sunDir = normalize(uniforms.sunDirection);
    const sunY = sunDir.y;
    const twilightFactorTsl: SkyNode = smoothstep(-0.22, 0.08, sunY).mul(
      float(1).sub(smoothstep(0.05, 0.32, sunY)),
    );
    const nightFactorTsl = float(1).sub(smoothstep(-0.18, 0.035, sunY));
    const sunAboveHorizon = smoothstep(-0.04, 0.04, sunY);

    const y = clamp(dir.y, -1.0, 1.0);
    const mu = clamp(dot(dir, sunDir), -1.0, 1.0);
    const angleToSun: SkyNode = acos(mu);
    const mu2 = mu.mul(mu);

    const turbidity = clamp(uniforms.turbidity, 0.0, 5.0);
    const turbidity01 = turbidity.div(5.0);
    const aerialIntensity: SkyNode = clamp(uniforms.scatteringIntensity, 0.0, 2.0);
    const aerialDistance: SkyNode = clamp(uniforms.scatteringDistance, 1.0, 200.0);
    const aerialNear: SkyNode = float(1).sub(smoothstep(35.0, 200.0, aerialDistance));
    const aerialAmount: SkyNode = aerialIntensity.mul(mix(float(0.25), float(1.55), aerialNear));
    const sunAltitude01: SkyNode = smoothstep(-0.02, 0.55, sunY);
    const lowSun: SkyNode = float(1).sub(smoothstep(0.10, 0.55, sunY));
    const sunPathLength: SkyNode = clamp(float(1).div(max(0.035, sunY.add(0.08))), 1.0, 18.0);
    const solarExtinction: SkyNode = (exp as SkyNode)(
      vec3(0.58, 0.31, 0.09)
        .mul(sunPathLength)
        .mul(mix(float(0.030), float(0.082), turbidity01))
        .negate(),
    );
    const scatteredSunTint: SkyNode = mix(
      vec3(1.22, 0.58, 0.26),
      vec3(1.0, 0.96, 0.88),
      sunAltitude01,
    ).mul(
      mix(
        vec3(1.0, 0.78, 0.48),
        solarExtinction.add(vec3(0.18, 0.10, 0.04)),
        lowSun.mul(0.85),
      ),
    );
    const rayleighStrength = mix(0.92, 1.55, smoothstep(0.0, 3.5, turbidity))
      .mul(float(1).add(aerialAmount.mul(0.22)));
    const mieStrength = mix(0.14, 2.25, smoothstep(0.0, 5.0, turbidity))
      .mul(float(1).add(aerialAmount.mul(0.42)));
    const betaR = vec3(0.17, 0.36, 0.92).mul(rayleighStrength);
    const betaM = vec3(0.66, 0.54, 0.42).mul(mieStrength);

    const zenithCos = max(0.025, y);
    const airMass = clamp(float(1).div(zenithCos.add(0.065)), 1.0, 16.0);
    const opticalDepth = airMass.mul(mix(0.11, 0.24, turbidity01));
    const extinction: SkyNode = (exp as SkyNode)(betaR.add(betaM).mul(opticalDepth).negate());
    const rayleighPhase = float(0.05968310365946075).mul(float(1).add(mu2));
    const g = mix(0.72, 0.88, turbidity01);
    const g2 = g.mul(g);
    const miePhase = float(0.1193662073189215)
      .mul(float(1).sub(g2))
      .mul(float(1).add(mu2))
      .div(float(2).add(g2))
      .div(pow(float(1).add(g2).sub(g.mul(2.0).mul(mu)), 1.5));

    const scatter = betaR.mul(rayleighPhase)
      .add(betaM.mul(miePhase).mul(scatteredSunTint))
      .mul(float(1).sub(extinction));
    const skyScatter = scatter.mul(sunAboveHorizon)
      .mul(mix(float(6.8), float(10.8), lowSun.mul(0.45).add(turbidity01.mul(0.35))))
      .mul(float(1).add(aerialAmount.mul(0.30)));

    const horizonClamp01 = clamp(y, 0.0, 1.0);
    const horizonPower = mix(9.0, 2.0, clamp(uniforms.horizon, 0.0, 1.0));
    const horizonRamp = pow(float(1).sub(horizonClamp01), horizonPower);
    const sunFacingHorizon: SkyNode = pow(saturate(mu.mul(0.5).add(0.5)), 1.65);
    const antiSunHorizon: SkyNode = pow(saturate(mu.mul(-0.5).add(0.5)), 2.2);
    const horizonNeutral: SkyNode = mix(
      vec3(0.58, 0.68, 0.86),
      vec3(0.78, 0.84, 0.94),
      sunAltitude01,
    );
    const horizonWarm: SkyNode = mix(
      vec3(0.95, 0.65, 0.40),
      vec3(1.22, 0.50, 0.20),
      twilightFactorTsl.add(lowSun.mul(0.35)),
    );
    const horizonCool: SkyNode = vec3(0.42, 0.45, 0.72)
      .mul(antiSunHorizon)
      .mul(lowSun)
      .mul(0.34);
    const horizonTint = mix(
      horizonNeutral,
      horizonWarm,
      saturate(
        sunFacingHorizon
          .mul(lowSun.mul(0.72).add(twilightFactorTsl.mul(0.95)))
          .mul(sunAboveHorizon),
      ),
    ).add(horizonCool);
    const horizonWash = horizonRamp.mul(sunAboveHorizon)
      .mul(
        mix(
          float(0.08),
          float(0.58),
          turbidity01.add(lowSun.mul(0.35)).add(aerialAmount.mul(0.38)),
        ),
      );
    const twilightColor = scatteredSunTint
      .mul(vec3(1.0, 0.48, 0.20))
      .mul(twilightFactorTsl)
      .mul(horizonRamp.add(0.18));

    const groundFalloff = pow(float(1).sub(horizonClamp01), 3.0);
    const groundBounce = vec3(0.22, 0.21, 0.18)
      .mul(groundFalloff)
      .mul(uniforms.groundLight)
      .mul(0.22);
    const nightColor = mix(vec3(0.006, 0.010, 0.025), vec3(0.020, 0.018, 0.032), horizonRamp);
    const stars = vec3(0).toVar();
    If(nightFactorTsl.greaterThan(0), () => {
      stars.assign(starField(
        dir,
        nightFactorTsl,
        uniforms.starsIntensity,
        uniforms.starsSize,
        uniforms.galaxyIntensity,
      ).mul(smoothstep(-0.05, 0.16, y)));
    });

    const sunRadius = clamp(uniforms.sunAngularRadius, 0.0001, 0.10);
    const aaEdge = max(float(0.0006), sunRadius.mul(0.08));
    const discMask: SkyNode = float(1).sub(
      smoothstep(sunRadius.sub(aaEdge), sunRadius.add(aaEdge), angleToSun),
    );
    const limbT = saturate(angleToSun.div(max(float(0.00001), sunRadius)));
    const limbDarken = float(1).sub(limbT.mul(limbT).mul(0.18));
    const sunCore = float(60.0).mul(discMask).mul(limbDarken).mul(sunAboveHorizon);
    const glow = clamp(uniforms.sunGlow, 0.0, 2.0);
    const haloFalloff = mix(420.0, 18.0, smoothstep(0.0, 2.0, glow));
    const haloIntensity = mix(0.6, 4.5, smoothstep(0.0, 2.0, glow));
    const halo = pow(saturate(mu), haloFalloff).mul(haloIntensity).mul(sunAboveHorizon);
    const sunTint = mix(
      vec3(1.0, 0.55, 0.22),
      vec3(1.0, 0.96, 0.86),
      smoothstep(0.05, 0.45, sunY),
    );
    const sun = sunTint.mul(sunCore.add(halo)).mul(uniforms.sunVisibility);

    let color: SkyNode = mix(skyScatter, horizonTint, horizonWash)
      .add(twilightColor)
      .add(groundBounce)
      .add(sun);
    color = mix(color, nightColor.add(stars), nightFactorTsl);
    // The lower hemisphere represents ground irradiance, not an atmosphere
    // evaluated with a clamped horizon ray. Blend continuously at the horizon.
    const groundDay = vec3(0.075, 0.085, 0.070)
      .mul(mix(float(0.35), float(1.3), uniforms.groundLight))
      .mul(sunAboveHorizon);
    const groundColor = mix(groundDay, vec3(0.002, 0.003, 0.006), nightFactorTsl);
    color = mix(groundColor, color, smoothstep(-0.85, 0.0, y));
    color = color.mul(uniforms.exposure);
    const skyFogCoverage: SkyNode = clamp(uniforms.fogSkyCoverage, 0.0, 2.0);
    const skyFogHeight: SkyNode = clamp(uniforms.fogSkyHeight, 0.0, 1.0);
    const skyFogSoftness: SkyNode = clamp(uniforms.fogSkySoftness, 0.0, 1.0);
    const skyFogDepth: SkyNode = uniforms.atmosphericFogDensity.mul(
      mix(float(260.0), float(980.0), skyFogCoverage.mul(0.5)),
    );
    const skyFogPresence: SkyNode = saturate(
      float(1).sub((exp as SkyNode)(skyFogDepth.mul(skyFogDepth).negate())),
    );
    const skyFogTop: SkyNode = mix(float(0.20), float(1.05), skyFogHeight);
    const skyFogBase: SkyNode = mix(float(-0.06), float(-0.30), skyFogSoftness);
    const skyFogBand: SkyNode = float(1).sub(smoothstep(skyFogBase, skyFogTop, y));
    const skyFogShape: SkyNode = pow(
      skyFogBand,
      mix(float(0.34), float(0.86), skyFogSoftness),
    );
    const skyFogMask: SkyNode = saturate(
      skyFogShape
        .mul(skyFogPresence)
        .mul(mix(float(0.0), float(1.65), skyFogCoverage)),
    );
    color = mix(color, uniforms.atmosphericFogColor, skyFogMask);
    return vec4(color, 1.0);
  })();

  return material;
}
