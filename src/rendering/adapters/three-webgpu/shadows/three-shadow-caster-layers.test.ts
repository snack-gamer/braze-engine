import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import {
  assignThreeShadowCasterLayer,
  THREE_DYNAMIC_SHADOW_CASTER_LAYER,
  THREE_STATIC_SHADOW_CASTER_LAYER,
} from "./three-shadow-caster-layers";

describe("Three shadow caster layers", () => {
  it("moves a caster between dedicated layers without removing visible layer zero", () => {
    const mesh = new Mesh();
    mesh.castShadow = true;

    assignThreeShadowCasterLayer(mesh, "static");
    expect(mesh.layers.isEnabled(0)).toBe(true);
    expect(mesh.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)).toBe(true);
    expect(mesh.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(false);

    assignThreeShadowCasterLayer(mesh, "dynamic");
    expect(mesh.layers.isEnabled(0)).toBe(true);
    expect(mesh.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)).toBe(false);
    expect(mesh.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(true);
  });

  it("clears both dedicated layers when an object stops casting", () => {
    const mesh = new Mesh();
    mesh.castShadow = true;
    assignThreeShadowCasterLayer(mesh, "dynamic");

    mesh.castShadow = false;
    assignThreeShadowCasterLayer(mesh, "dynamic");

    expect(mesh.layers.isEnabled(0)).toBe(true);
    expect(mesh.layers.isEnabled(THREE_STATIC_SHADOW_CASTER_LAYER)).toBe(false);
    expect(mesh.layers.isEnabled(THREE_DYNAMIC_SHADOW_CASTER_LAYER)).toBe(false);
  });
});
