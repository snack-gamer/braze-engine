import { animatorControllerClipReferences, resolveAnimatorControllerDefinition } from "../../character/application/playback/animator-playback-resolution";
import { resolveCharacterAssetReference } from "../../character/application/character-asset-library";
import type { AssetRef } from "../../assets/domain/asset-reference";
import type { LibraryAsset } from "../../lib/asset-api";
import type { SceneObject } from "../../scene/domain/scene-object";
import type { RuntimePrefabResourceCatalog } from "./runtime-prefab-resource-catalog";
import { EntityWorldError } from "../../world/domain/entity-world";

/** Saved references must resolve before a prefab can enqueue any structural work. */
export function validateRuntimePrefabAnimator(object: SceneObject, catalog: RuntimePrefabResourceCatalog): void {
  if (!object.animator?.enabled) return;
  const animation = catalog.animation;
  const fail = (message: string): never => { throw new EntityWorldError("missing-asset", `${object.name}: ${message}`); };
  if (!animation) return fail("Animator dependencies are absent from the saved resource catalog.");
  if (!object.assetRef?.guid) return fail("Animator requires a target model AssetRef.");
  const visited = new Set<string>();
  const model = (reference: AssetRef, kind?: "clip" | "avatar"): LibraryAsset => {
    const matches = animation.importedAssets.filter((asset) => asset.guid === reference.guid.toLowerCase());
    if (matches.length !== 1) return fail(`Animator model '${reference.guid}' is absent from its captured catalog.`);
    const asset = matches[0], imported = animation.modelImportDocuments[asset.filename];
    if (!imported) return fail(`Animator model '${asset.filename}' has no saved import document.`);
    if (kind) {
      const entries = asset.subAssets?.filter((entry) => entry.localId === reference.localId && entry.kind === kind);
      if (entries?.length !== 1 || entries[0].importEnabled === false || (kind === "clip" && !imported.settings.importAnimations)) return fail(`Animator ${kind} '${reference.guid}:${reference.localId}' is missing or disabled.`);
    }
    if (!visited.has(asset.guid!)) {
      visited.add(asset.guid!);
      const rig = imported.settings.rig;
      if (rig.kind === "humanoid" && rig.avatarSource.kind === "copyFromAvatar") model(rig.avatarSource.avatarRef, "avatar");
    }
    return asset;
  };
  const target = model(object.assetRef!);
  if (target.url !== catalog.models.get(object.assetRef!.guid.toLowerCase())?.url) fail("Animator target and model snapshots disagree.");
  if (JSON.stringify(animation.modelImportDocuments[target.filename].settings) !== JSON.stringify(catalog.models.get(object.assetRef!.guid.toLowerCase())?.settings)) fail("Animator target importer snapshots disagree.");
  const controller = resolveAnimatorControllerDefinition(object.animator, animation.characterAssets);
  if (!controller) return fail("Animator controller is absent from its captured character library.");
  animatorControllerClipReferences(controller).forEach((reference) => model(reference, "clip"));
  for (const layer of controller.layers) if (layer.avatarMaskRef) {
    const mask = resolveCharacterAssetReference(animation.characterAssets, layer.avatarMaskRef);
    if (mask?.kind !== "avatarMask") fail(`Avatar Mask '${layer.avatarMaskRef.guid}' is absent from its captured character library.`);
    if (mask?.kind === "avatarMask" && mask.asset.sourceRef) model(mask.asset.sourceRef, mask.asset.sourceRef.localId === "main" || mask.asset.sourceRef.localId === undefined ? undefined : "avatar");
  }
  if (object.animator.avatarRef) {
    if (object.animator.avatarRef.guid.toLowerCase() !== object.assetRef!.guid.toLowerCase()) fail("Avatar must belong to the target model.");
    model(object.animator.avatarRef, "avatar");
  }
}
