import { describe, expect, it } from "vitest";
import type { Material } from "../domain/material";
import { materialThumbnailRevision } from "./material-thumbnail-revision";

function material(patch: Partial<Material> = {}): Material {
  return {
    id: "mat-preview",
    name: "Preview",
    color: "#c74f45",
    roughness: 0.55,
    metalness: 0,
    specularIntensity: 0.5,
    clearcoat: 0,
    clearcoatRoughness: 0.25,
    ior: 1.5,
    transmission: 0,
    emissive: "#000000",
    emissiveIntensity: 0,
    opacity: 1,
    normalScale: 1,
    bumpScale: 0.05,
    aoIntensity: 1,
    alphaCutoff: 0.05,
    envMapIntensity: 1,
    thickness: 0,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    side: "double",
    wireframe: false,
    ...patch,
  };
}

describe("material thumbnail revision", () => {
  it("changes for physical surface and texture edits but not label edits", () => {
    const source = material();
    const revision = materialThumbnailRevision(source);

    expect(materialThumbnailRevision({ ...source, name: "Renamed" })).toBe(revision);
    expect(materialThumbnailRevision({ ...source, roughness: 0.1 })).not.toBe(revision);
    expect(materialThumbnailRevision({ ...source, baseColorTextureUrl: "/textures/cloth.png" }))
      .not.toBe(revision);
  });
});
