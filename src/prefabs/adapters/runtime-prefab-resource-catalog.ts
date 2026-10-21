import type { RuntimePrefabSource } from "../domain/runtime-prefab";
import { normalizeImmutableModelImportSettings } from "../../lib/model-import-settings";
import { normalizeProjectMaterials } from "../../materials/serialization/material-library-codec";
import { EntityWorldError } from "../../world/domain/entity-world";
import { captureRuntimePrefabAnimationCatalog } from "./runtime-prefab-animation-catalog";

/** Bounded, immutable resource metadata for one Play lifetime. No global importer overrides. */
export function captureRuntimePrefabResourceCatalog(sources: readonly RuntimePrefabSource[]) {
  type Model = NonNullable<RuntimePrefabSource["resources"]>["models"][number];
  const models = new Map<string, Model & { settings: ReturnType<typeof normalizeImmutableModelImportSettings> }>();
  const materials = new Map<string, ReturnType<typeof normalizeProjectMaterials>[number]>();
  for (const source of sources) {
    if (!source.resources) continue;
    if (JSON.stringify(source.resources).length > 1024 * 1024) throw new EntityWorldError("capacity", "Runtime prefab resource metadata exceeds 1 MiB.");
    const resources = structuredClone(source.resources);
    if (!Array.isArray(resources.models) || resources.models.length > 128 || !Array.isArray(resources.materials) || resources.materials.length > 256) throw new EntityWorldError("capacity", "Invalid runtime prefab resource catalog.");
    for (const model of resources.models) {
      const guid = model.asset?.guid?.toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(guid ?? "") || !["gltf", "fbx", "usdz"].includes(model.primitive) || typeof model.url !== "string"
        || model.url.length > 4096 || !/^\.?\/3d-models\//.test(model.url)) throw new EntityWorldError("missing-asset", "Invalid resolved runtime model asset.");
      let path: string;
      try { path = decodeURIComponent(model.url.split(/[?#]/, 1)[0]); } catch { throw new EntityWorldError("missing-asset", "Invalid model artifact URL encoding."); }
      if (path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) throw new EntityWorldError("missing-asset", "Model artifacts must stay inside the project asset root.");
      const previous = models.get(guid);
      if (previous && (previous.url !== model.url || JSON.stringify(previous.importSettings) !== JSON.stringify(model.importSettings))) throw new EntityWorldError("invalid-command", "Conflicting model snapshots in runtime prefab catalog.");
      models.set(guid, Object.freeze({ ...model, asset: Object.freeze({ guid, localId: "main" }), settings: normalizeImmutableModelImportSettings(model.importSettings) }));
    }
    for (const material of normalizeProjectMaterials(resources.materials)) {
      const previous = materials.get(material.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(material)) throw new EntityWorldError("invalid-command", "Conflicting material snapshots in runtime prefab catalog.");
      materials.set(material.id, Object.freeze(material));
    }
  }
  if (models.size > 128 || materials.size > 256) throw new EntityWorldError("capacity", "Play supports 128 runtime model assets and 256 materials.");
  return { models, materials, animation: captureRuntimePrefabAnimationCatalog(sources) };
}
export type RuntimePrefabResourceCatalog = ReturnType<typeof captureRuntimePrefabResourceCatalog>;
