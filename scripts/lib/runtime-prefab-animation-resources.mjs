import { compileModelImportDocuments } from "./player-package-compiler.mjs";

const GUID = /^[a-f0-9]{32}$/i;
const record = (value) => value && typeof value === "object" && !Array.isArray(value);

export function validatePrefabModelSourceFilename(filename, guid) {
  if (typeof filename !== "string" || !filename || /[\\\0?#]/.test(filename) || filename.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Runtime model ${guid} has an unsafe source filename.`);
}

/** Matches the existing Animator Play snapshot target budget; repeated instances share a target. */
export function validatePrefabAnimationTargetCapacity(documents) {
  const targets = new Set();
  for (const document of documents) for (const object of document.objects ?? []) {
    if (["gltf", "fbx", "usdz"].includes(object.primitive) && record(object.animator) && object.animator.enabled !== false && typeof object.assetRef?.guid === "string") targets.add(object.assetRef.guid.toLowerCase());
  }
  if (targets.size > 32) throw new Error("Runtime prefabs support at most 32 distinct animated target models per Play snapshot.");
}

/** Saved dependency closure for enabled imported-model Animators, including external takes and masks. */
export function capturePrefabAnimationResources(document, assets, indexRecords, rawLibrary = {}) {
  validatePrefabAnimationTargetCapacity([document]);
  const animated = document.objects.filter((object) => ["gltf", "fbx", "usdz"].includes(object.primitive) && record(object.animator) && object.animator.enabled !== false);
  if (!animated.length) return undefined;
  const controllers = rawLibrary.animatorControllers ?? rawLibrary.animator_controllers ?? rawLibrary.controllers ?? [];
  const masks = rawLibrary.avatarMasks ?? rawLibrary.avatar_masks ?? rawLibrary.masks ?? [];
  const selectedControllers = new Map(), selectedMasks = new Map(), models = new Map(), settings = new Map();
  const authored = (reference, list, kind) => {
    const guid = reference?.guid?.toLowerCase(), localId = reference?.localId ?? reference?.local_id ?? "main";
    if (!GUID.test(guid ?? "") || localId !== "main") throw new Error(`Invalid runtime Animator ${kind} reference.`);
    const matches = list.filter((entry) => entry.id?.toLowerCase() === guid);
    if (matches.length !== 1) throw new Error(`Runtime Animator ${kind} ${guid} is missing or ambiguous.`);
    return matches[0];
  };
  const model = (reference, kind = "model") => {
    const guid = reference?.guid?.toLowerCase(), localId = reference?.localId ?? reference?.local_id ?? "main";
    if (!GUID.test(guid ?? "")) throw new Error(`Invalid runtime Animator ${kind} reference.`);
    const matches = assets.filter((asset) => asset.guid?.toLowerCase() === guid);
    if (matches.length !== 1 || matches[0].kind !== "model" || matches[0].status !== "ready") throw new Error(`Runtime Animator model ${guid} is missing, ambiguous or not ready.`);
    const asset = matches[0], indices = indexRecords.filter((entry) => entry.guid?.toLowerCase() === guid);
    if (indices.length !== 1) throw new Error(`Runtime Animator model ${guid} has no unique saved importer snapshot.`);
    validatePrefabModelSourceFilename(asset.filename, guid);
    if (indices[0].importSettings !== undefined && !record(indices[0].importSettings)) throw new Error(`Runtime Animator model ${guid} has invalid saved importer settings.`);
    if (kind !== "model") {
      const subassets = (asset.subAssets ?? []).filter((entry) => entry.localId === localId && entry.kind === kind);
      if (subassets.length !== 1 || subassets[0].importEnabled === false) throw new Error(`Runtime Animator ${kind} ${guid}:${localId} is missing or disabled.`);
      if (kind === "clip" && indices[0].importSettings?.importAnimations === false) throw new Error(`Runtime Animator clip ${guid}:${localId} is disabled by saved importer settings.`);
    } else if (localId !== "main") throw new Error("Runtime Animator targets require main model references.");
    if (models.has(guid)) return;
    const url = `/3d-models/${asset.filename.split("/").map(encodeURIComponent).join("/")}?importVersion=${encodeURIComponent(asset.contentRevision ?? indices[0].sourceHash ?? guid)}`;
    models.set(guid, { ...asset, guid, url }); settings.set(guid, indices[0]);
    const copied = indices[0].importSettings?.rig?.avatarSource;
    if (copied?.kind === "copyFromAvatar") model(copied.avatarRef, "avatar");
  };
  const walkController = (value) => {
    if (Array.isArray(value)) { value.forEach(walkController); return; }
    if (!record(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (["clipRef", "clip_ref"].includes(key)) model(child, "clip");
      else if (["avatarMaskRef", "avatar_mask_ref"].includes(key)) {
        const mask = authored(child, masks, "Avatar Mask"); selectedMasks.set(mask.id.toLowerCase(), mask);
        if (mask.sourceRef ?? mask.source_ref) {
          const source = mask.sourceRef ?? mask.source_ref;
          model(source, (source.localId ?? source.local_id ?? "main") === "main" ? "model" : "avatar");
        }
      } else walkController(child);
    }
  };
  for (const object of animated) {
    model(object.assetRef);
    const component = object.animator, legacy = component.controllerRef ?? component.controller_ref;
    const controller = legacy ? authored(legacy, controllers, "controller") : component.controller;
    if (!record(controller)) throw new Error(`${object.name}: enabled Animator needs a saved controller.`);
    if (legacy) selectedControllers.set(controller.id.toLowerCase(), controller);
    walkController(controller);
    const avatar = component.avatarRef ?? component.avatar_ref;
    if (avatar) {
      if (avatar.guid?.toLowerCase() !== object.assetRef.guid.toLowerCase()) throw new Error(`${object.name}: Avatar must belong to its target model.`);
      model(avatar, "avatar");
    }
  }
  if (models.size > 128 || selectedControllers.size > 32 || selectedMasks.size > 128) throw new Error("Runtime Animator dependency capacity exceeded.");
  const importedAssets = [...models.values()].sort((a, b) => a.filename.localeCompare(b.filename));
  return structuredClone({ importedAssets,
    characterAssets: { version: rawLibrary.version ?? "braze/character-assets-v0", animatorControllers: [...selectedControllers.values()], avatarMasks: [...selectedMasks.values()] },
    modelImportDocuments: compileModelImportDocuments(importedAssets, [...settings.values()]),
  });
}
