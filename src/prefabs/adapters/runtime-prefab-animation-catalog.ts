import { decodeImportedAssets, decodeModelImportDocuments, validateModelImportManifest } from "../../assets/serialization/model-import-manifest-codec";
import { normalizeImmutableModelImportSettings } from "../../lib/model-import-settings";
import { decodeCharacterAssetLibrary } from "../../character/serialization/character-asset-library-codec";
import { createEmptyCharacterAssetLibrary } from "../../character/domain/character-asset-library";
import type { RuntimePrefabSource } from "../domain/runtime-prefab";
import { EntityWorldError } from "../../world/domain/entity-world";
import { THREE_ANIMATOR_PLAYBACK_LIMITS } from "../../character/adapters/three/three-animator-playback-limits";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Merges saved Animator dependencies without consulting the live project or global importer state. */
export function captureRuntimePrefabAnimationCatalog(sources: readonly RuntimePrefabSource[]) {
  const targets = new Set<string>();
  for (const source of sources) {
    if (!record(source.document) || !Array.isArray(source.document.objects)) continue;
    for (const object of source.document.objects) if (record(object) && ["gltf", "fbx", "usdz"].includes(String(object.primitive))
      && record(object.animator) && object.animator.enabled !== false && record(object.assetRef) && typeof object.assetRef.guid === "string") targets.add(object.assetRef.guid.toLowerCase());
  }
  if (targets.size > THREE_ANIMATOR_PLAYBACK_LIMITS.maximumLiveSessions) throw new EntityWorldError("capacity", "Runtime prefabs support at most 32 distinct animated target models per Play snapshot.");
  const imported = new Map<string, ReturnType<typeof decodeImportedAssets>[number]>();
  const documents = new Map<string, ReturnType<typeof decodeModelImportDocuments>[string]>();
  const library = createEmptyCharacterAssetLibrary();
  let present = false;
  const controllers = new Map<string, typeof library.animatorControllers[number]>();
  const masks = new Map<string, typeof library.avatarMasks[number]>();
  const merge = <T>(map: Map<string, T>, key: string, value: T): void => {
    const previous = map.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value)) throw new EntityWorldError("invalid-command", `Conflicting Animator resource snapshots for '${key}'.`);
    map.set(key, value);
  };
  for (const source of sources) {
    const raw = source.resources?.animation;
    if (!raw) continue;
    present = true;
    const snapshot = structuredClone(raw);
    const assets = decodeImportedAssets(snapshot.importedAssets), imports = decodeModelImportDocuments(snapshot.modelImportDocuments);
    validateModelImportManifest(assets, imports);
    const characterAssets = decodeCharacterAssetLibrary(snapshot.characterAssets);
    for (const asset of assets) {
      const guid = asset.guid?.toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(guid ?? "") || asset.kind !== "model" || asset.status !== "ready") throw new EntityWorldError("missing-asset", "Animator dependencies require ready model assets.");
      let path: string;
      try { path = decodeURIComponent(asset.url.split(/[?#]/, 1)[0]); } catch { throw new EntityWorldError("missing-asset", "Invalid Animator model URL."); }
      if (!/^\.?\/3d-models\//.test(path) || path.includes("\\") || path.includes("\0") || path.split("/").includes("..")) throw new EntityWorldError("missing-asset", "Animator models must stay inside the project asset root.");
      merge(imported, guid!, { ...asset, guid });
    }
    for (const [filename, document] of Object.entries(imports)) {
      const settings = normalizeImmutableModelImportSettings(document.settings);
      const rigValue: unknown = document.settings.rig;
      const rawRig = record(rigValue) ? rigValue : undefined;
      const rawAvatar = rawRig && record(rawRig.avatarSource) ? rawRig.avatarSource : undefined;
      if (rawAvatar?.kind === "copyFromAvatar" && (settings.rig.kind !== "humanoid" || settings.rig.avatarSource.kind !== "copyFromAvatar")) throw new EntityWorldError("missing-asset", `Invalid saved copied-Avatar settings for '${filename}'.`);
      merge(documents, filename, { ...document, settings });
    }
    characterAssets.animatorControllers.forEach((controller) => merge(controllers, controller.id, controller));
    characterAssets.avatarMasks.forEach((mask) => merge(masks, mask.id, mask));
  }
  if (!present) return undefined;
  if (imported.size > 128 || controllers.size > 32 || masks.size > 128) throw new EntityWorldError("capacity", "Animator resource catalog capacity exceeded.");
  library.animatorControllers = [...controllers.values()]; library.avatarMasks = [...masks.values()];
  return freezeSnapshot({ importedAssets: [...imported.values()], characterAssets: library, modelImportDocuments: Object.fromEntries(documents) });
}

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeSnapshot); Object.freeze(value);
  }
  return value;
}
