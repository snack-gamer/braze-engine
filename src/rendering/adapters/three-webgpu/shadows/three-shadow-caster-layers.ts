import type { Object3D } from "three";

export const THREE_STATIC_SHADOW_CASTER_LAYER = 30;
export const THREE_DYNAMIC_SHADOW_CASTER_LAYER = 29;

export const THREE_STATIC_SHADOW_CASTER_MASK = 2 ** THREE_STATIC_SHADOW_CASTER_LAYER;
export const THREE_DYNAMIC_SHADOW_CASTER_MASK = 2 ** THREE_DYNAMIC_SHADOW_CASTER_LAYER;

export type ThreeShadowCasterClass = "static" | "dynamic" | "none";

/** Assigns only Braze's dedicated shadow layer, preserving layer 0 visibility. */
export function assignThreeShadowCasterLayer(
  root: Object3D,
  casterClass: ThreeShadowCasterClass,
): void {
  root.traverse((object) => {
    if (!("castShadow" in object)) return;
    object.layers.disable(THREE_STATIC_SHADOW_CASTER_LAYER);
    object.layers.disable(THREE_DYNAMIC_SHADOW_CASTER_LAYER);
    if (object.castShadow !== true || casterClass === "none") return;
    object.layers.enable(casterClass === "dynamic"
      ? THREE_DYNAMIC_SHADOW_CASTER_LAYER
      : THREE_STATIC_SHADOW_CASTER_LAYER);
  });
}
