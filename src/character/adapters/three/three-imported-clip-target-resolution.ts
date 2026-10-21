import type * as THREE from "three";
import type { AssetRef } from "../../../assets/domain/asset-reference";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPlaybackClip,
} from "../../application/playback/animator-playback-contracts";
import { assetRefKey } from "../../runtime/animator-controller-compiler";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import {
  buildThreePlaybackAvatar,
  resolveThreeImportedClip,
  type ThreeImportedClipPlaybackMode,
  uniqueImportedAvatarReference,
} from "./three-animator-imported-assets";
import { resolveExternalThreeAnimatorClip } from "./three-animator-retarget-resolution";

export type ResolveThreeImportedClipForTargetInput = Readonly<{
  clipReference: AssetRef;
  sourceAsset: LibraryAsset;
  sourceRoot: THREE.Object3D;
  sourceAnimations: readonly THREE.AnimationClip[];
  sourceImport: ModelImportDocument;
  targetAsset: LibraryAsset;
  targetRoot: THREE.Object3D;
  targetImport: ModelImportDocument;
  targetAvatar?: AnimatorPlaybackAvatar;
  importedAssets: readonly LibraryAsset[];
  playbackMode?: ThreeImportedClipPlaybackMode;
}>;

/** Resolves one exact imported clip against its local or externally retargeted Three target. */
export function resolveThreeImportedClipForTarget(
  input: ResolveThreeImportedClipForTargetInput,
): CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>> {
  const sourceGuid = input.clipReference.guid.toLowerCase();
  if (sourceGuid === input.targetAsset.guid?.toLowerCase()) {
    return resolveThreeImportedClip(
      input.clipReference,
      input.sourceAsset,
      input.sourceAnimations,
      input.targetRoot,
      input.targetAvatar,
      input.playbackMode,
    );
  }
  if (!input.targetAvatar) return characterRuntimeFailure(
    "missing-target-avatar",
    `External clip ${assetRefKey(input.clipReference)} requires a target Avatar.`,
  );
  const sourceAvatarRef = sourceAvatarReference(input.clipReference, input.sourceAsset);
  if (!sourceAvatarRef.value) return { value: null, diagnostics: sourceAvatarRef.diagnostics };
  const sourceAvatar = buildThreePlaybackAvatar(
    sourceAvatarRef.value,
    input.sourceAsset,
    input.sourceRoot,
    input.sourceImport.settings,
    input.importedAssets,
  );
  if (!sourceAvatar.value) return { value: null, diagnostics: sourceAvatar.diagnostics };
  const imported = resolveThreeImportedClip(
    input.clipReference,
    input.sourceAsset,
    input.sourceAnimations,
    input.sourceRoot,
    sourceAvatar.value,
    input.playbackMode,
  );
  if (!imported.value) return { value: null, diagnostics: imported.diagnostics };
  return resolveExternalThreeAnimatorClip({
    clip: imported.value,
    sourceRoot: input.sourceRoot,
    targetRoot: input.targetRoot,
    sourceAvatar: sourceAvatar.value,
    targetAvatar: input.targetAvatar,
    sourceRevision: `${modelRevision(input.sourceAsset, input.sourceImport)}:${input.playbackMode ?? "conditionedPose"}`,
    targetRevision: modelRevision(input.targetAsset, input.targetImport),
    settingsRevision: `${input.sourceImport.importVersion}:${input.targetImport.importVersion}`,
  });
}

function sourceAvatarReference(
  clipReference: AssetRef,
  asset: LibraryAsset,
): CharacterRuntimeResult<AssetRef> {
  const subAsset = asset.subAssets?.find((entry) => entry.localId === clipReference.localId);
  const avatarIds = new Set<string>();
  const bindings = Array.isArray(subAsset?.bindings) ? subAsset.bindings : [];
  for (const value of bindings) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const ids = (value as Record<string, unknown>).avatarLocalIds;
    if (!Array.isArray(ids)) continue;
    ids.forEach((id) => { if (typeof id === "string" && id.trim()) avatarIds.add(id.trim()); });
  }
  if (avatarIds.size > 1) return characterRuntimeFailure(
    "ambiguous-source-avatar",
    `Clip ${assetRefKey(clipReference)} targets more than one imported Avatar.`,
  );
  const localId = [...avatarIds][0];
  const exact = localId && asset.guid ? { guid: asset.guid, localId } : uniqueImportedAvatarReference(asset);
  return exact
    ? characterRuntimeSuccess(exact)
    : characterRuntimeFailure(
        "missing-source-avatar",
        `Clip ${assetRefKey(clipReference)} has no unambiguous source Avatar.`,
      );
}

function modelRevision(asset: LibraryAsset, document: ModelImportDocument): string {
  return `${asset.contentRevision ?? "unversioned"}:${document.importVersion}`;
}
