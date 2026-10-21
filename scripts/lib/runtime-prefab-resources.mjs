import { capturePrefabAnimationResources, validatePrefabModelSourceFilename } from "./runtime-prefab-animation-resources.mjs";

/** Capture only saved resources reachable from registered runtime prefabs. */
export function capturePrefabResources(document, assets, indexRecords = [], materials = [], characterAssets = {}) {
  const models = new Map(), selectedMaterials = new Map();
  for (const object of document.objects) {
    if (!["gltf", "fbx", "usdz"].includes(object.primitive)) continue;
    const guid = object.assetRef?.guid?.toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(guid ?? "") || (object.assetRef.localId && object.assetRef.localId !== "main")) throw new Error(`${object.name}: runtime models require a main model AssetRef; reassign the model in the editor.`);
    const matches = assets.filter((asset) => asset.guid?.toLowerCase() === guid);
    if (matches.length !== 1 || matches[0].kind !== "model" || matches[0].status !== "ready") throw new Error(`Runtime model ${guid} is missing, ambiguous or not ready.`);
    const asset = matches[0];
    validatePrefabModelSourceFilename(asset.filename, guid);
    const extension = asset.filename.split(".").pop().toLowerCase();
    const primitive = ["glb", "gltf"].includes(extension) ? "gltf" : extension;
    if (primitive !== object.primitive) throw new Error(`${object.name}: model format disagrees with its AssetRef.`);
    const index = indexRecords.find((record) => record.guid?.toLowerCase() === guid);
    if (!index) throw new Error(`Runtime model ${guid} has no saved importer snapshot.`);
    const url = `/3d-models/${asset.filename.split("/").map(encodeURIComponent).join("/")}?importVersion=${encodeURIComponent(asset.contentRevision ?? index.sourceHash ?? guid)}`;
    models.set(guid, { asset: { guid, localId: "main" }, primitive, url, importSettings: index.importSettings ?? {} });
    const ids = [object.materialId, ...(object.importedMaterialBindings ?? []).map((binding) => binding.materialId)].filter(Boolean);
    for (const id of ids) {
      const matches = materials.filter((material) => material.id === id);
      if (matches.length !== 1) throw new Error(`${object.name}: saved material '${id}' is missing or ambiguous.`);
      const material = structuredClone(matches[0]);
      for (const [key, value] of Object.entries(material)) if (key.endsWith("TextureUrl") && value) {
        if (typeof value !== "string" || !value.startsWith("/3d-models/")) throw new Error(`Runtime material '${id}' requires project texture assets.`);
        let filename;
        try { filename = decodeURIComponent(value.slice(11).split(/[?#]/, 1)[0]); } catch { throw new Error(`Invalid texture URL in material '${id}'.`); }
        const images = assets.filter((image) => image.filename === filename && image.kind === "image" && image.status === "ready");
        if (images.length !== 1) throw new Error(`Runtime material '${id}' texture '${filename}' is missing or not ready.`);
        material[key] = `${value.split(/[?#]/, 1)[0]}?importVersion=${encodeURIComponent(images[0].contentRevision ?? images[0].guid)}`;
      }
      selectedMaterials.set(id, material);
    }
  }
  if (!models.size) return undefined;
  if (models.size > 128 || selectedMaterials.size > 256) throw new Error("Runtime prefab resource capacity exceeded.");
  const animation = capturePrefabAnimationResources(document, assets, indexRecords, characterAssets);
  return structuredClone({ models: [...models.values()], materials: [...selectedMaterials.values()], ...(animation ? { animation } : {}) });
}
