import { executeObjectCommands, validateHierarchy, type ObjectCommandOptions } from "../../automation/application/object-commands";
import { makeObject } from "../../lib/payload";
import { validateRuntimePrefab } from "../adapters/runtime-prefab-validation";
import { PREFAB_DOCUMENT_VERSION, type PrefabDocument } from "../domain/prefab-document";
import { decodePrefabDocument, encodePrefabDocument } from "../serialization/prefab-document";

function diagnostics(document: PrefabDocument) {
  const authored: string[] = [], runtime: string[] = [];
  try {
    validateHierarchy(document.objects);
    const roots = document.objects.filter((object) => !object.parentId);
    if (roots.length !== 1 || roots[0].primitive !== "transform" || document.rootIds.length !== 1 || document.rootIds[0] !== roots[0].id) {
      throw new Error("Prefab authoring requires one Transform master root containing every node.");
    }
    for (const object of document.objects) {
      if (object.prefabLink) throw new Error("Nested prefab links are not supported.");
      if (object.behaviors?.unavailable) throw new Error(`${object.id}: ${object.behaviors.unavailable.message}`);
      if (object.uiCanvas?.unavailable) throw new Error(`${object.id}: ${object.uiCanvas.unavailable.message}`);
    }
  } catch (error) { authored.push(error instanceof Error ? error.message : String(error)); }
  try { validateRuntimePrefab(document); }
  catch (error) { runtime.push(error instanceof Error ? error.message : String(error)); }
  return { valid: authored.length === 0, diagnostics: authored, objectCount: document.objects.length,
    runtimeSubset: { supported: runtime.length === 0, diagnostics: runtime, dependenciesVerified: false } };
}

export function inspectPrefab(input: unknown) {
  const document = decodePrefabDocument(input, { name: "Prefab", filename: "Prefab.braze-prefab.json" });
  return { document: encodePrefabDocument(document), ...diagnostics(document) };
}

/** Prefab objects use their own codec; never round-trip them through scene serialization. */
export function executePrefabCommands(input: unknown, commands: unknown, options?: ObjectCommandOptions) {
  const document = decodePrefabDocument(input, { name: "Prefab", filename: "Prefab.braze-prefab.json" });
  const result = executeObjectCommands(document.objects, commands, { ...options, requireCamera: false });
  const next = { ...document, objects: result.objects };
  return { document: { ...input as object, ...encodePrefabDocument(next) }, changedIds: result.changedIds, ...diagnostics(next) };
}

export function createPrefab(name: unknown, commands: unknown, options?: ObjectCommandOptions) {
  if (typeof name !== "string" || !name.trim() || name.length > 256) throw new Error("Prefab name must be 1–256 characters.");
  const document: PrefabDocument = { version: PREFAB_DOCUMENT_VERSION, name: name.trim(), createdAt: new Date().toISOString(),
    rootIds: ["root"], objects: [makeObject("transform", 0, { id: "root", name: name.trim(), position: [0, 0, 0] })] };
  return executePrefabCommands(document, commands, options);
}
