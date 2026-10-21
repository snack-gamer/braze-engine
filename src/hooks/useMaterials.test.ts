import { describe, expect, it } from "vitest";
import { normalizeProjectMaterials, normalizeStoredMaterials } from "./useMaterials";

describe("stored material normalization", () => {
  it("salvages valid entries instead of dropping the library for one malformed item", () => {
    const materials = normalizeStoredMaterials([
      null,
      { id: "valid", name: "Brick", color: "#aa5533", roughness: 0.8 },
      "broken",
      { id: "partial", name: "Partial", roughness: "invalid", baseColorTextureUrl: 42 },
    ]);

    expect(materials.map((material) => material.id)).toEqual(["valid", "partial"]);
    expect(materials[0].name).toBe("Brick");
    expect(materials[1].roughness).toBe(0.55);
    expect(materials[1].baseColorTextureUrl).toBeUndefined();
  });

  it("rejects the wrong top-level storage shape", () => {
    expect(normalizeStoredMaterials({ materials: [] })).toEqual([]);
  });

  it("migrates missing and duplicate identities deterministically", () => {
    const legacy = [
      { name: "Missing ID" },
      { id: "duplicate", name: "First" },
      { id: "duplicate", name: "Second" },
    ];
    const first = normalizeStoredMaterials(legacy).map((material) => material.id);
    const second = normalizeStoredMaterials(legacy).map((material) => material.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });

  it("rejects lossy repairs when decoding the canonical project section", () => {
    expect(() => normalizeProjectMaterials([
      { id: "valid", name: "Valid", roughness: 0.5 },
      null,
    ])).toThrow(/materials\[1\] must be an object/);
    expect(() => normalizeProjectMaterials([
      { id: "invalid", name: "Invalid", roughness: "high" },
    ])).toThrow(/roughness must be a finite number/);
    expect(() => normalizeProjectMaterials([
      { id: "same", name: "First" },
      { id: "same", name: "Second" },
    ])).toThrow(/duplicate id 'same'/);
  });

  it("still fills omitted legacy fields in an otherwise valid canonical record", () => {
    expect(normalizeProjectMaterials([{ id: "legacy", name: "Legacy" }])[0]).toMatchObject({
      id: "legacy",
      name: "Legacy",
      roughness: 0.55,
    });
  });
});
