import type { SceneObject } from "../../types";
import { isMeshRenderObject, restoreComponentPatch } from "../../lib/components";
export type RendererEdit = { enabled?: boolean; castShadows?: boolean; receiveShadows?: boolean; includeInRender?: boolean;
  materialId?: string | null; materialBindings?: { slotKey: string; materialId: string; sourceName?: string }[] };
export function captureRendererEdit(input: unknown): RendererEdit {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Mesh Renderer values must be an object.");
  const allowed = new Set(["enabled", "castShadows", "receiveShadows", "includeInRender", "materialId", "materialBindings"]);
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) throw new Error(`Unsupported Mesh Renderer field: ${key}`);
    if (key === "materialId") {
      if (value !== null && (typeof value !== "string" || !value.trim() || value.length > 256)) throw new Error("materialId must be a material ID or null.");
    } else if (key === "materialBindings") {
      if (!Array.isArray(value) || value.length > 128) throw new Error("At most 128 material bindings are supported.");
      const keys = new Set<string>();
      for (const binding of value) {
        if (!binding || typeof binding !== "object" || Object.keys(binding).some((k) => !["slotKey", "materialId", "sourceName"].includes(k))
          || [binding.slotKey, binding.materialId].some((v) => typeof v !== "string" || !v.trim() || v.length > 256)
          || binding.sourceName !== undefined && (typeof binding.sourceName !== "string" || binding.sourceName.length > 256)
          || keys.has(binding.slotKey)) throw new Error("Material bindings require unique slot keys and material IDs.");
        keys.add(binding.slotKey);
      }
    } else if (typeof value !== "boolean") throw new Error(`${key} must be boolean.`);
  }
  return structuredClone(input) as RendererEdit;
}
export function rendererPatch(object: SceneObject, input: unknown): Partial<SceneObject> {
  if (!isMeshRenderObject(object)) throw new Error("Mesh Renderer requires a mesh object.");
  const { materialId, materialBindings, includeInRender, ...settings } = captureRendererEdit(input);
  return { ...restoreComponentPatch(object, "meshRenderer"), meshRenderer: { ...object.meshRenderer, ...settings },
    ...(materialId === undefined ? {} : { materialId: materialId ?? undefined }),
    ...(materialBindings === undefined ? {} : { importedMaterialBindings: materialBindings }),
    ...(includeInRender === undefined ? {} : { renderVisible: includeInRender }) };
}
export function resetRendererPatch(object: SceneObject) {
  return rendererPatch(object, { enabled: true, castShadows: true, receiveShadows: true, includeInRender: true, materialId: null, materialBindings: [] });
}
