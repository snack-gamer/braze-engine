import type * as THREE from "three";
import type { AssetRef } from "../../../assets/domain/asset-reference";
import { primitiveForFilename } from "../../../assets/import-support";
import {
  fetchModelImport,
  type LibraryAsset,
  type ModelImportDocument,
} from "../../../lib/asset-api";
import { versionedModelAssetUrl } from "../../../lib/model-import-settings";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import type {
  AnimatorPlaybackAvatar,
  AnimatorPlaybackClip,
} from "../../application/playback/animator-playback-contracts";
import {
  characterRuntimeFailure,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-action-cache";
import {
  buildThreePlaybackAvatar,
  uniqueImportedAvatarReference,
} from "./three-animator-imported-assets";
import type { ThreeAnimatorPlaybackCatalog } from "./three-animator-playback-resolver";
import { resolveThreeImportedClipForTarget } from "./three-imported-clip-target-resolution";

type ViewportResolutionInput = Readonly<{
  runtime: Runtime;
  catalog: ThreeAnimatorPlaybackCatalog;
  target: SceneObject;
  targetBody: THREE.Object3D;
  clipRef: AssetRef;
  isCurrent?: () => boolean;
  loadModelImport?: (filename: string) => Promise<ModelImportDocument>;
}>;

/** Loads one source clip and resolves it onto the existing selected Scene body. */
export async function resolveThreeImportedClipViewportTarget(
  input: ViewportResolutionInput,
): Promise<CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>>> {
  if (!previewIsCurrent(input)) return disposedPreview();
  const targetRef = input.target.assetRef;
  if (!targetRef || (targetRef.localId !== undefined && targetRef.localId !== "main")) {
    return characterRuntimeFailure(
      "missing-preview-target-model",
      `Selected object ${input.target.name} is not an imported model main asset.`,
    );
  }
  const targetAsset = uniqueModel(input.catalog.importedAssets, targetRef.guid);
  if (!targetAsset.value) return { value: null, diagnostics: targetAsset.diagnostics };
  const sourceAsset = uniqueModel(input.catalog.importedAssets, input.clipRef.guid);
  if (!sourceAsset.value) return { value: null, diagnostics: sourceAsset.diagnostics };
  const loadImport = input.loadModelImport ?? fetchModelImport;
  const targetImport = await loadImportDocument(loadImport, targetAsset.value);
  if (!targetImport.value) return { value: null, diagnostics: targetImport.diagnostics };
  if (!previewIsCurrent(input)) return disposedPreview();

  const sameModel = targetRef.guid.toLowerCase() === input.clipRef.guid.toLowerCase();
  if (sameModel) return resolveThreeImportedClipForTarget({
    clipReference: input.clipRef,
    sourceAsset: sourceAsset.value,
    sourceRoot: input.targetBody,
    sourceAnimations: importedAnimations(input.targetBody),
    sourceImport: targetImport.value,
    targetAsset: targetAsset.value,
    targetRoot: input.targetBody,
    targetImport: targetImport.value,
    importedAssets: input.catalog.importedAssets,
  });

  const targetAvatar = resolveTargetAvatar(input, targetAsset.value, targetImport.value);
  if (!targetAvatar.value) return { value: null, diagnostics: targetAvatar.diagnostics };
  const sourceImport = await loadImportDocument(loadImport, sourceAsset.value);
  if (!sourceImport.value) return { value: null, diagnostics: sourceImport.diagnostics };
  if (!previewIsCurrent(input)) return disposedPreview();

  const sourceLease = input.runtime.assetCache.acquire(
    versionedModelAssetUrl(sourceAsset.value.url, sourceImport.value.importVersion),
    primitiveForFilename(sourceAsset.value.filename),
  );
  try {
    const source = await sourceLease.value;
    if (!previewIsCurrent(input)) return disposedPreview();
    const resolved = resolveThreeImportedClipForTarget({
      clipReference: input.clipRef,
      sourceAsset: sourceAsset.value,
      sourceRoot: source.object,
      sourceAnimations: source.animations,
      sourceImport: sourceImport.value,
      targetAsset: targetAsset.value,
      targetRoot: input.targetBody,
      targetImport: targetImport.value,
      targetAvatar: targetAvatar.value,
      importedAssets: input.catalog.importedAssets,
    });
    return {
      value: resolved.value,
      diagnostics: [...targetAvatar.diagnostics, ...resolved.diagnostics],
    };
  } catch (error) {
    return characterRuntimeFailure(
      "imported-clip-preview-source-load-failed",
      `Could not load ${sourceAsset.value.filename} for preview: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    sourceLease.release();
  }
}

function resolveTargetAvatar(
  input: ViewportResolutionInput,
  targetAsset: LibraryAsset,
  targetImport: ModelImportDocument,
): CharacterRuntimeResult<AnimatorPlaybackAvatar> {
  const reference = input.target.animator?.avatarRef ?? uniqueImportedAvatarReference(targetAsset);
  if (!reference) return characterRuntimeFailure(
    "missing-target-avatar",
    `Selected object ${input.target.name} needs one unambiguous imported Avatar.`,
  );
  return buildThreePlaybackAvatar(
    reference,
    targetAsset,
    input.targetBody,
    targetImport.settings,
    input.catalog.importedAssets,
  );
}

function uniqueModel(
  assets: readonly LibraryAsset[],
  guid: string,
): CharacterRuntimeResult<LibraryAsset> {
  const normalized = guid.toLowerCase();
  const matches = assets.filter((asset) => asset.guid?.toLowerCase() === normalized);
  if (matches.length !== 1) return characterRuntimeFailure(
    matches.length > 1 ? "ambiguous-preview-model-guid" : "unresolved-preview-model-guid",
    matches.length > 1
      ? `Model ${normalized} appears more than once in the imported asset catalog.`
      : `Model ${normalized} is absent from the imported asset catalog.`,
  );
  return { value: matches[0]!, diagnostics: [] };
}

async function loadImportDocument(
  load: (filename: string) => Promise<ModelImportDocument>,
  asset: LibraryAsset,
): Promise<CharacterRuntimeResult<ModelImportDocument>> {
  try {
    return { value: await load(asset.filename), diagnostics: [] };
  } catch (error) {
    return characterRuntimeFailure(
      "imported-clip-preview-settings-load-failed",
      `Could not load import settings for ${asset.filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function importedAnimations(body: THREE.Object3D): readonly THREE.AnimationClip[] {
  return Array.isArray(body.userData.animationClips)
    ? body.userData.animationClips as readonly THREE.AnimationClip[]
    : [];
}

function disposedPreview<T>(): CharacterRuntimeResult<T> {
  return characterRuntimeFailure({
    code: "disposed-imported-clip-preview",
    severity: "warning",
    message: "The imported clip preview was cancelled with the Scene viewport.",
  });
}

function previewIsCurrent(input: ViewportResolutionInput): boolean {
  return !input.runtime.disposed && (input.isCurrent?.() ?? true);
}
