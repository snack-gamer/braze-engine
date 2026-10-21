import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { assignThreeShadowCasterLayer } from "../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import {
  DYNAMIC_SHADOW_CASTER_TRANSFORM,
  shadowCasterTransformMask,
  STATIC_SHADOW_CASTER_TRANSFORM,
} from "./shadow-caster-transform-invalidation";

describe("live shadow caster transform invalidation", () => {
  it("finds every caster class moved by a hierarchy transform", () => {
    const root = new THREE.Group();
    const staticCaster = new THREE.Mesh();
    const dynamicCaster = new THREE.Mesh();
    staticCaster.castShadow = true;
    dynamicCaster.castShadow = true;
    root.add(staticCaster, dynamicCaster);
    assignThreeShadowCasterLayer(staticCaster, "static");
    assignThreeShadowCasterLayer(dynamicCaster, "dynamic");

    expect(shadowCasterTransformMask(root)).toBe(
      STATIC_SHADOW_CASTER_TRANSFORM | DYNAMIC_SHADOW_CASTER_TRANSFORM,
    );
    dynamicCaster.castShadow = false;
    expect(shadowCasterTransformMask(root)).toBe(STATIC_SHADOW_CASTER_TRANSFORM);
  });

  it("does not invalidate editor-only or non-casting nodes", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh());
    expect(shadowCasterTransformMask(root)).toBe(0);
  });
});
