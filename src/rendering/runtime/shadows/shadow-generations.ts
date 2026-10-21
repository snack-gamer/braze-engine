declare const shadowGenerationBrand: unique symbol;

export type ShadowGeneration<Kind extends string> = number & {
  readonly [shadowGenerationBrand]: Kind;
};

export type ShadowCameraGeneration = ShadowGeneration<"camera">;
export type ShadowCameraPoseGeneration = ShadowGeneration<"camera-pose">;
export type ShadowLightGeneration = ShadowGeneration<"light">;
export type ShadowExtentGeneration = ShadowGeneration<"extent">;
export type StaticCasterGeneration = ShadowGeneration<"static-casters">;
export type DynamicCasterGeneration = ShadowGeneration<"dynamic-casters">;

export type ShadowGenerationSnapshot = Readonly<{
  camera: ShadowCameraGeneration;
  cameraPose: ShadowCameraPoseGeneration;
  light: ShadowLightGeneration;
  extent: ShadowExtentGeneration;
  staticCasters: StaticCasterGeneration;
  dynamicCasters: DynamicCasterGeneration;
}>;

export function shadowCameraGeneration(value: number): ShadowCameraGeneration {
  return checkedGeneration(value, "camera") as ShadowCameraGeneration;
}

export function shadowCameraPoseGeneration(value: number): ShadowCameraPoseGeneration {
  return checkedGeneration(value, "camera pose") as ShadowCameraPoseGeneration;
}

export function shadowLightGeneration(value: number): ShadowLightGeneration {
  return checkedGeneration(value, "light") as ShadowLightGeneration;
}

export function shadowExtentGeneration(value: number): ShadowExtentGeneration {
  return checkedGeneration(value, "extent") as ShadowExtentGeneration;
}

export function staticCasterGeneration(value: number): StaticCasterGeneration {
  return checkedGeneration(value, "static caster") as StaticCasterGeneration;
}

export function dynamicCasterGeneration(value: number): DynamicCasterGeneration {
  return checkedGeneration(value, "dynamic caster") as DynamicCasterGeneration;
}

function checkedGeneration(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Shadow ${label} generation must be a non-negative safe integer.`);
  }
  return value;
}
