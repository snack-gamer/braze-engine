import { ENTITY_LAYER_COUNT } from "../domain/entity-layers";

export type ProjectLayerCatalog = Readonly<{ version: 1; names: readonly string[] }>;
export const DEFAULT_LAYER_CATALOG: ProjectLayerCatalog = Object.freeze({ version: 1,
  names: Object.freeze(Array.from({ length: ENTITY_LAYER_COUNT }, (_, index) => index === 0 ? "Default" : "")) });

/** Slot indices are persistent identities. Renaming never moves assignments. */
export function decodeProjectLayerCatalog(value: unknown): ProjectLayerCatalog {
  if (value === undefined) return DEFAULT_LAYER_CATALOG;
  const data = value as Partial<ProjectLayerCatalog> | null;
  if (!data || data.version !== 1 || !Array.isArray(data.names) || data.names.length !== ENTITY_LAYER_COUNT) {
    throw new Error("Project layers require version 1 and exactly 32 slots.");
  }
  const names = data.names.map((name) => {
    if (typeof name !== "string" || name.trim() !== name || name.length > 48 || /[\u0000-\u001f]/.test(name)) {
      throw new Error("Layer names must be trimmed text of at most 48 characters.");
    }
    return name;
  });
  if (names[0] !== "Default" || new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) {
    throw new Error("Layer names must be unique. Layer 0 is always Default.");
  }
  return { version: 1, names };
}
