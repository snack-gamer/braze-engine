import type { Camera, DirectionalLightShadow } from "three";
import type { ShadowCascadeTier } from "../../../runtime/shadows/shadow-cascade-splits";
import type { ThreeShadowFramePlan } from "./three-shadow-plan-adapter";

export type ThreeCsmBindingResult = Readonly<{
  status: "applied" | "awaiting-three-initialization";
  requestedUpdates: number;
  reusedCascades: number;
  frustumsUpdated: boolean;
}>;

export type ThreeCsmShadowBinding = Readonly<{
  apply: (frame: ThreeShadowFramePlan) => ThreeCsmBindingResult;
}>;

export type ThreeShadowCasterLayerMasks = Readonly<{
  staticCasters: number;
  dynamicCasters: number;
}>;

export type ThreeCsmPublicSurface = {
  camera: Camera | null;
  customSplitsCallback: (
    cascades: number,
    cameraNear: number,
    cameraFar: number,
    breaks: number[],
  ) => void;
  lights: readonly Readonly<{ shadow?: DirectionalLightShadow }>[];
  maxFar: number;
  mode: "uniform" | "logarithmic" | "practical" | "custom";
  updateFrustums: () => void;
};

const TIERS = ["near", "mid", "far"] as const;

/** Owns only r184's public CSM/light-shadow fields; it never reaches into `_shadowNodes`. */
export function createThreeCsmShadowBinding(
  csm: ThreeCsmPublicSurface,
  casterLayers: ThreeShadowCasterLayerMasks,
): ThreeCsmShadowBinding {
  const layers = validateCasterLayers(casterLayers);
  const breaks: [number, number, 1] = [0, 0, 1];
  const splitCallback: ThreeCsmPublicSurface["customSplitsCallback"] = (
    _count,
    _near,
    _far,
    target,
  ) => { target.push(breaks[0], breaks[1], breaks[2]); };
  const frustumConfiguration = {
    initialized: false,
    shadowFar: 0,
    firstBreak: 0,
    secondBreak: 0,
  };
  return Object.freeze({
    apply: (frame) => applyFrame(
      csm,
      frame,
      breaks,
      splitCallback,
      frustumConfiguration,
      layers,
    ),
  });
}

function applyFrame(
  csm: ThreeCsmPublicSurface,
  frame: ThreeShadowFramePlan,
  breaks: [number, number, 1],
  splitCallback: ThreeCsmPublicSurface["customSplitsCallback"],
  frustumConfiguration: {
    initialized: boolean;
    shadowFar: number;
    firstBreak: number;
    secondBreak: number;
  },
  casterLayers: ThreeShadowCasterLayerMasks,
): ThreeCsmBindingResult {
  const firstBreak = frame.normalizedBreaks[0];
  const secondBreak = frame.normalizedBreaks[1];
  breaks[0] = firstBreak;
  breaks[1] = secondBreak;
  csm.mode = "custom";
  csm.maxFar = frame.shadowFar;
  csm.customSplitsCallback = splitCallback;

  const nearShadow = csm.lights[0]?.shadow;
  const midShadow = csm.lights[1]?.shadow;
  const farShadow = csm.lights[2]?.shadow;
  if (csm.camera === null || csm.lights.length !== TIERS.length
    || !nearShadow || !midShadow || !farShadow) {
    return Object.freeze({
      status: "awaiting-three-initialization",
      requestedUpdates: 0,
      reusedCascades: 0,
      frustumsUpdated: false,
    });
  }

  const frustumsUpdated = frame.updateFrustums
    || !frustumConfiguration.initialized
    || frame.shadowFar !== frustumConfiguration.shadowFar
    || firstBreak !== frustumConfiguration.firstBreak
    || secondBreak !== frustumConfiguration.secondBreak;
  if (frustumsUpdated) {
    csm.updateFrustums();
    frustumConfiguration.initialized = true;
    frustumConfiguration.shadowFar = frame.shadowFar;
    frustumConfiguration.firstBreak = firstBreak;
    frustumConfiguration.secondBreak = secondBreak;
  }

  const shadows: Readonly<Record<ShadowCascadeTier, DirectionalLightShadow>> = {
    near: nearShadow,
    mid: midShadow,
    far: farShadow,
  };
  let requestedUpdates = 0;
  for (const command of frame.commands) {
    const shadow = shadows[command.tier];
    shadow.autoUpdate = false;
    shadow.mapSize.set(command.mapSize, command.mapSize);
    shadow.camera.layers.mask = command.casterScope === "static-only"
      ? casterLayers.staticCasters
      : casterLayers.staticCasters | casterLayers.dynamicCasters;
    if (command.update) {
      shadow.needsUpdate = true;
      requestedUpdates += 1;
    }
  }
  return Object.freeze({
    status: "applied",
    requestedUpdates,
    reusedCascades: frame.commands.length - requestedUpdates,
    frustumsUpdated,
  });
}

function validateCasterLayers(layers: ThreeShadowCasterLayerMasks): ThreeShadowCasterLayerMasks {
  const staticCasters = unsignedMask(layers.staticCasters, "static");
  const dynamicCasters = unsignedMask(layers.dynamicCasters, "dynamic");
  if ((staticCasters & dynamicCasters) !== 0) {
    throw new RangeError("Static and dynamic shadow caster layer masks must not overlap.");
  }
  requireDedicatedLayer(staticCasters, "Static");
  requireDedicatedLayer(dynamicCasters, "Dynamic");
  return Object.freeze({ staticCasters, dynamicCasters });
}

function requireDedicatedLayer(mask: number, label: string): void {
  if ((mask & 0xFFFFFFFE) === 0) {
    throw new RangeError(`${label} shadow casters require a dedicated non-default Three layer.`);
  }
}

function unsignedMask(mask: number, label: string): number {
  if (!Number.isInteger(mask) || mask <= 0 || mask > 0xFFFFFFFF) {
    throw new RangeError(`${label} shadow caster layer mask must be a non-zero uint32.`);
  }
  return mask >>> 0;
}
