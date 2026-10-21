import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { retainMaterialTexture } from "./texture-cache";

describe("material texture ownership", () => {
  it("deduplicates a material's lease and releases it exactly once on disposal", () => {
    const material = new THREE.MeshStandardMaterial();
    const texture = new THREE.Texture();
    const release = vi.fn();
    const acquire = vi.fn(() => ({ value: texture, release }));

    expect(retainMaterialTexture(material, "map", acquire)).toBe(texture);
    expect(retainMaterialTexture(material, "map", acquire)).toBe(texture);
    expect(acquire).toHaveBeenCalledOnce();

    material.dispose();
    material.dispose();
    expect(release).toHaveBeenCalledOnce();
  });
});
