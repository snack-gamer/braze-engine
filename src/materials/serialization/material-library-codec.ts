import { createAuthoredId, createDeterministicAuthoredId } from "../../identity/authored-id";
import type { Material } from "../domain/material";

const DEFAULT_MATERIAL: Omit<Material, "id" | "name"> = {
  color: "#cfd1d4",
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
};

const OPTIONAL_STRING_FIELDS = [
  "baseColorTextureUrl", "baseColorTextureName", "baseColorTextureFilename",
  "normalTextureUrl", "normalTextureName", "normalTextureFilename",
  "bumpTextureUrl", "bumpTextureName", "bumpTextureFilename",
  "roughnessTextureUrl", "roughnessTextureName", "roughnessTextureFilename",
  "metalnessTextureUrl", "metalnessTextureName", "metalnessTextureFilename",
  "emissiveTextureUrl", "emissiveTextureName", "emissiveTextureFilename",
  "alphaTextureUrl", "alphaTextureName", "alphaTextureFilename",
  "aoTextureUrl", "aoTextureName", "aoTextureFilename",
  "sourceAssetFilename", "sourceMaterialSlotKey", "sourceMaterialName",
] as const satisfies ReadonlyArray<keyof Material>;

const OPTIONAL_BOOLEAN_FIELDS = [
  "baseColorTextureFlipY", "normalTextureFlipY", "bumpTextureFlipY",
  "roughnessTextureFlipY", "metalnessTextureFlipY", "emissiveTextureFlipY",
  "alphaTextureFlipY", "aoTextureFlipY",
] as const satisfies ReadonlyArray<keyof Material>;

const owns = (record: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(record, key);

function assertProjectMaterial(raw: unknown, index: number): asserts raw is Partial<Material> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`project materials[${index}] must be an object`);
  }
  const source = raw as Record<string, unknown>;
  for (const key of ["id", "name"] as const) {
    if (owns(source, key) && (typeof source[key] !== "string" || !source[key].trim())) {
      throw new Error(`project materials[${index}].${key} must be a non-empty string`);
    }
  }
  for (const [key, fallback] of Object.entries(DEFAULT_MATERIAL)) {
    if (!owns(source, key)) continue;
    const value = source[key];
    if (typeof fallback === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`project materials[${index}].${key} must be a finite number`);
    }
    if (typeof fallback === "string" && typeof value !== "string") {
      throw new Error(`project materials[${index}].${key} must be a string`);
    }
    if (typeof fallback === "boolean" && typeof value !== "boolean") {
      throw new Error(`project materials[${index}].${key} must be a boolean`);
    }
  }
  if (owns(source, "side") && !["front", "back", "double"].includes(String(source.side))) {
    throw new Error(`project materials[${index}].side is invalid`);
  }
  for (const key of OPTIONAL_STRING_FIELDS) {
    if (owns(source, key) && typeof source[key] !== "string") {
      throw new Error(`project materials[${index}].${key} must be a string`);
    }
  }
  for (const key of OPTIONAL_BOOLEAN_FIELDS) {
    if (owns(source, key) && typeof source[key] !== "boolean") {
      throw new Error(`project materials[${index}].${key} must be a boolean`);
    }
  }
}

export function normalizeMaterialLibraryEntry(
  raw: unknown,
  fallbackName: string,
  fallbackId?: string,
): Material {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<Material>
    : {};
  const normalized = {
    ...DEFAULT_MATERIAL,
    ...source,
    id: typeof source.id === "string" && source.id.trim()
      ? source.id
      : fallbackId ?? createAuthoredId("mat"),
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : fallbackName,
  } as Material;
  const record = normalized as unknown as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(DEFAULT_MATERIAL)) {
    const value = record[key];
    if (typeof fallback === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      record[key] = fallback;
    } else if (typeof fallback === "string" && typeof value !== "string") {
      record[key] = fallback;
    } else if (typeof fallback === "boolean" && typeof value !== "boolean") {
      record[key] = fallback;
    }
  }
  if (!["front", "back", "double"].includes(normalized.side)) normalized.side = DEFAULT_MATERIAL.side;
  for (const key of OPTIONAL_STRING_FIELDS) {
    if (record[key] !== undefined && typeof record[key] !== "string") delete record[key];
  }
  for (const key of OPTIONAL_BOOLEAN_FIELDS) {
    if (record[key] !== undefined && typeof record[key] !== "boolean") delete record[key];
  }
  return normalized;
}

export function normalizeStoredMaterials(raw: unknown): Material[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const materials: Material[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return;
    const material = normalizeMaterialLibraryEntry(
      item,
      `Material ${index + 1}`,
      createDeterministicAuthoredId("mat-legacy", `missing:${index}`),
    );
    const originalId = material.id;
    let collision = 0;
    while (seen.has(material.id)) {
      material.id = createDeterministicAuthoredId(
        "mat-legacy",
        `duplicate:${originalId}:${index}:${collision}`,
      );
      collision += 1;
    }
    seen.add(material.id);
    materials.push(material);
  });
  return materials;
}

/** Strict canonical decoder; browser recovery normalization remains lenient. */
export function normalizeProjectMaterials(raw: unknown): Material[] {
  if (!Array.isArray(raw)) throw new Error("project materials must be an array");
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    assertProjectMaterial(item, index);
    if (typeof item.id !== "string") return;
    if (seen.has(item.id)) throw new Error(`project materials contains duplicate id '${item.id}'`);
    seen.add(item.id);
  });
  return normalizeStoredMaterials(raw);
}
