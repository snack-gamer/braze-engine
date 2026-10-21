import type * as THREE from "three";
import {
  THREE_DYNAMIC_SHADOW_CASTER_LAYER,
  THREE_STATIC_SHADOW_CASTER_LAYER,
} from "../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";

export const STATIC_SHADOW_CASTER_TRANSFORM = 1;
export const DYNAMIC_SHADOW_CASTER_TRANSFORM = 2;

/** Returns the caster classes affected when a live transform moves a subtree. */
export function shadowCasterTransformMask(root: THREE.Object3D): number {
  let mask = 0;
  root.traverse((object) => {
    if (object.castShadow !== true) return;
    if (object.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)) {
      mask |= STATIC_SHADOW_CASTER_TRANSFORM;
    }
    if (object.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)) {
      mask |= DYNAMIC_SHADOW_CASTER_TRANSFORM;
    }
  });
  return mask;
}
