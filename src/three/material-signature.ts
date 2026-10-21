import type { Material, SceneObject } from "../types";
import { displacerSignature } from "./modifiers/displacer-material";

const MATERIAL_PIPELINE_VERSION = "webgpu-physical-v7-displacer-bump";

function authoredMaterialSignature(material: Material, includeSourceSlot: boolean): string {
  return [
    material.id,
    ...(includeSourceSlot ? [material.sourceMaterialSlotKey ?? ""] : []),
    material.color,
    material.roughness,
    material.metalness,
    material.specularIntensity,
    material.clearcoat,
    material.clearcoatRoughness,
    material.ior,
    material.transmission,
    material.emissive,
    material.emissiveIntensity,
    material.opacity,
    material.normalScale,
    material.bumpScale,
    material.aoIntensity,
    material.alphaCutoff,
    material.envMapIntensity,
    material.thickness,
    material.sheen,
    material.sheenRoughness,
    material.sheenColor,
    material.side,
    material.wireframe ? "wf" : "",
    material.baseColorTextureUrl ?? "",
    material.normalTextureUrl ?? "",
    material.bumpTextureUrl ?? "",
    material.roughnessTextureUrl ?? "",
    material.metalnessTextureUrl ?? "",
    material.emissiveTextureUrl ?? "",
    material.alphaTextureUrl ?? "",
    material.aoTextureUrl ?? "",
  ].join(":");
}

export function materialSignature(
  object: SceneObject,
  material: Material | null,
  materialLibrary: Material[] = [],
): string {
  const importedIds = object.importedMaterialBindings?.map((binding) => binding.materialId) ?? [];
  const importedMaterials = importedIds
    .map((id) => materialLibrary.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Material => Boolean(candidate));
  return [
    MATERIAL_PIPELINE_VERSION,
    object.color,
    object.wireframe?.enabled ? "wf" : "",
    displacerSignature(object),
    material ? `mat:${authoredMaterialSignature(material, false)}` : "",
    importedMaterials.map((item) => authoredMaterialSignature(item, true)).join(";"),
  ].join("|");
}
