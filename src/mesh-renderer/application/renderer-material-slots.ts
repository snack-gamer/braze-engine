import type { Material, SceneObject } from "../../types";
export type RendererMaterialSlot = { key: string; sourceName?: string; materialId?: string };
/** One resolver for Inspector fields and public authoring discovery. */
export function rendererMaterialSlots(object: SceneObject, materials: readonly Material[], sourceSlots: readonly RendererMaterialSlot[] = []): RendererMaterialSlot[] {
  let filename: string | undefined;
  try {
    const path = new URL(object.assetUrl ?? "", "http://braze.local").pathname;
    if (path.startsWith("/3d-models/")) filename = decodeURIComponent(path.slice(11));
  } catch { /* Missing sources retain explicit bindings below. */ }
  const generated = filename && !object.assetMeshBinding
    ? materials.filter((material) => material.sourceAssetFilename === filename && material.sourceMaterialSlotKey) : [];
  const slots = new Map<string, RendererMaterialSlot>(sourceSlots.map((slot) => [slot.key, slot]));
  for (const material of generated) slots.set(material.sourceMaterialSlotKey!, {
    key: material.sourceMaterialSlotKey!, sourceName: material.sourceMaterialName || material.name,
    materialId: object.importedMaterialBindings === undefined ? material.id : undefined,
  });
  for (const binding of object.importedMaterialBindings ?? []) slots.set(binding.slotKey, {
    key: binding.slotKey, sourceName: binding.sourceName ?? slots.get(binding.slotKey)?.sourceName, materialId: binding.materialId,
  });
  return slots.size ? [...slots.values()].map((slot) => ({ ...slot, materialId: object.materialId ?? slot.materialId }))
    : [{ key: "__whole__", materialId: object.materialId }];
}
