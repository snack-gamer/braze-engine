import { captureEntityTag } from "../domain/entity-tags";

export type ProjectTagCatalog = Readonly<{ version: 1; names: readonly string[] }>;
export const EMPTY_TAG_CATALOG: ProjectTagCatalog = Object.freeze({ version: 1, names: Object.freeze([]) });
export function decodeProjectTagCatalog(value: unknown): ProjectTagCatalog {
  if (value === undefined) return EMPTY_TAG_CATALOG;
  const data = value as Partial<ProjectTagCatalog> | null;
  if (!data || data.version !== 1 || !Array.isArray(data.names) || data.names.length > 256) {
    throw new Error("Project tags require version 1 and at most 256 names.");
  }
  const names = data.names.map(captureEntityTag);
  if (names.includes("Untagged") || new Set(names).size !== names.length) throw new Error("Project tags must be unique; Untagged is reserved.");
  return Object.freeze({ version: 1, names: Object.freeze(names) });
}
