import type * as THREE from "three";
import type { AssetRef } from "../../../assets/domain/asset-reference";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import type { CharacterAssetLibrary } from "../../domain/character-asset-library";
import {
  animatorControllerClipReferences,
  resolveAnimatorPlaybackAssets,
  resolveAnimatorControllerDefinition,
} from "../../application/playback/animator-playback-resolution";
import type {
  AnimatorPlaybackAssets,
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
  type ThreeImportedClipPlaybackMode,
  uniqueImportedAvatarReference,
} from "./three-animator-imported-assets";
import { resolveThreeImportedClipForTarget } from "./three-imported-clip-target-resolution";
import { THREE_ANIMATOR_PLAYBACK_LIMITS } from "./three-animator-playback-limits";
import { createThreeAnimatorPlaybackModelSnapshot, type ThreeAnimatorPlaybackModelSnapshot } from "./three-animator-playback-model-snapshot";
import type { ThreeAnimatorSourceLease } from "./three-animator-source-lease-cache";

export {
  playbackModelDependencies,
  selectedPlaybackModelGuids,
  type ThreeAnimatorPlaybackModelDependencies,
} from "./three-animator-playback-model-snapshot";

export type ThreeAnimatorPlaybackCatalog = Readonly<{
  library: CharacterAssetLibrary;
  importedAssets: readonly LibraryAsset[];
}>;

export type ThreeAnimatorPlaybackAssetResolver = Readonly<{
  resolve: (
    object: SceneObject,
    body: THREE.Object3D,
  ) => Promise<CharacterRuntimeResult<AnimatorPlaybackAssets<ThreeAnimatorClipResource>>>;
  dispose: () => void;
}>;

type ResolverInput = Readonly<{
  runtime: Pick<Runtime, "assetCache" | "disposed">;
  catalog: ThreeAnimatorPlaybackCatalog;
  objects: readonly SceneObject[];
  loadModelImport?: (filename: string) => Promise<ModelImportDocument>;
  modelSnapshot?: ThreeAnimatorPlaybackModelSnapshot;
}>;

/** Play-entry snapshot resolver. Source leases and import documents stay stable until disposal. */
export function createThreeAnimatorPlaybackAssetResolver(
  input: ResolverInput,
): ThreeAnimatorPlaybackAssetResolver {
  const snapshot = input.modelSnapshot ?? createThreeAnimatorPlaybackModelSnapshot({
    runtime: input.runtime,
    assets: input.catalog.importedAssets,
    objects: input.objects,
    library: input.catalog.library,
    ...(input.loadModelImport ? { loadModelImport: input.loadModelImport } : {}),
  });

  return {
    resolve: async (object, body) => {
      if (snapshot.isDisposed() || input.runtime.disposed) return characterRuntimeFailure({
        code: "disposed-animator-asset-resolver",
        severity: "warning",
        message: "Animator assets cannot resolve after the play snapshot was disposed.",
      });
      const targetGuid = object.assetRef?.guid.toLowerCase();
      const targetAsset = targetGuid ? snapshot.models.get(targetGuid) : undefined;
      const targetLocalId = object.assetRef?.localId;
      if (!object.animator || !targetGuid || !targetAsset
        || (targetLocalId !== undefined && targetLocalId !== "main")) return characterRuntimeFailure(
        "missing-animator-target-model",
        `Scene object ${object.id} has no exact imported target model main asset.`,
      );
      if (!snapshot.settings.has(targetGuid)) return capacityFailure(
        targetGuid,
        THREE_ANIMATOR_PLAYBACK_LIMITS.maximumSnapshotModels,
      );
      return resolveForTarget({
        object,
        body,
        targetAsset,
        targetSettings: await snapshot.settings.get(targetGuid)!,
        catalog: input.catalog,
        models: snapshot.models,
        settings: snapshot.settings,
        acquireSource: snapshot.acquireSource,
      });
    },
    dispose: snapshot.dispose,
  };
}

type TargetResolution = Readonly<{
  object: SceneObject;
  body: THREE.Object3D;
  targetAsset: LibraryAsset;
  targetSettings: CharacterRuntimeResult<ModelImportDocument>;
  catalog: ThreeAnimatorPlaybackCatalog;
  models: ReadonlyMap<string, LibraryAsset>;
  settings: ReadonlyMap<string, Promise<CharacterRuntimeResult<ModelImportDocument>>>;
  acquireSource: (guid: string) => ThreeAnimatorSourceLease | null;
}>;

async function resolveForTarget(
  input: TargetResolution,
): Promise<CharacterRuntimeResult<AnimatorPlaybackAssets<ThreeAnimatorClipResource>>> {
  const component = input.object.animator!;
  if (!input.targetSettings.value) return { value: null, diagnostics: input.targetSettings.diagnostics };
  const controller = resolveAnimatorControllerDefinition(component, input.catalog.library);
  const clipRefs = controller ? animatorControllerClipReferences(controller) : [];
  const requiresAvatar = Boolean(
    component.avatarRef
    || component.rootMotion.mode !== "disabled"
    || controller?.layers.some((layer) => Boolean(layer.avatarMaskRef))
    || clipRefs.some((reference) => reference.guid.toLowerCase() !== input.targetAsset.guid?.toLowerCase()),
  );
  const targetAvatarRef = component.avatarRef
    ?? (requiresAvatar ? uniqueImportedAvatarReference(input.targetAsset) ?? undefined : undefined);
  const targetAvatar = targetAvatarRef
    ? buildTargetAvatar(input, targetAvatarRef)
    : characterRuntimeSuccess<AnimatorPlaybackAvatar | undefined>(undefined);
  if (!targetAvatar.value && (targetAvatarRef || requiresAvatar)) {
    return targetAvatarRef
      ? { value: null, diagnostics: targetAvatar.diagnostics }
      : characterRuntimeFailure(
          "missing-target-avatar",
          `Scene object ${input.object.id} needs one unambiguous imported Avatar.`,
        );
  }

  const clips = new Map<string, CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>>>();
  const playbackMode: ThreeImportedClipPlaybackMode = component.rootMotion.mode !== "disabled"
    && !component.rootMotion.bakeIntoPose
    ? "rootMotionExtraction"
    : "conditionedPose";
  for (const reference of clipRefs) {
    const resolved = await resolveClip(
      input,
      reference,
      targetAvatar.value ?? undefined,
      playbackMode,
    );
    clips.set(assetRefKey(reference)!, resolved);
  }
  const resolved = resolveAnimatorPlaybackAssets<ThreeAnimatorClipResource>(component, input.catalog.library, {
    resolveClip: (reference) => clips.get(assetRefKey(reference)!) ?? characterRuntimeFailure(
      "clip-outside-play-snapshot",
      `Clip ${assetRefKey(reference)} was not captured at Play entry.`,
    ),
    resolveAvatar: (reference) => (
      targetAvatar.value && targetAvatar.value.id === assetRefKey(reference)
        ? characterRuntimeSuccess(targetAvatar.value, targetAvatar.diagnostics)
        : characterRuntimeFailure(
            "avatar-target-model-mismatch",
            `Avatar ${assetRefKey(reference)} does not belong to the target model.`,
          )
    ),
  });
  if (!resolved.value) return resolved;
  return characterRuntimeSuccess({
    ...resolved.value,
    ...(targetAvatar.value ? { avatar: targetAvatar.value } : {}),
  }, resolved.diagnostics);
}

function buildTargetAvatar(
  input: TargetResolution,
  reference: AssetRef,
): CharacterRuntimeResult<AnimatorPlaybackAvatar> {
  if (reference.guid.toLowerCase() !== input.targetAsset.guid?.toLowerCase()) {
    return characterRuntimeFailure(
      "avatar-target-model-mismatch",
      `Avatar ${assetRefKey(reference)} does not belong to ${input.targetAsset.filename}.`,
    );
  }
  return buildThreePlaybackAvatar(
    reference,
    input.targetAsset,
    input.body,
    input.targetSettings.value!.settings,
    input.catalog.importedAssets,
  );
}

async function resolveClip(
  input: TargetResolution,
  reference: AssetRef,
  targetAvatar: AnimatorPlaybackAvatar | undefined,
  playbackMode: ThreeImportedClipPlaybackMode,
): Promise<CharacterRuntimeResult<AnimatorPlaybackClip<ThreeAnimatorClipResource>>> {
  const sourceGuid = reference.guid.toLowerCase();
  const sourceAsset = input.models.get(sourceGuid);
  if (!sourceAsset) return characterRuntimeFailure(
    "unresolved-imported-clip-model",
    `Clip model ${sourceGuid} is absent from the Play-entry catalog.`,
  );
  const targetGuid = input.targetAsset.guid!.toLowerCase();
  if (sourceGuid === targetGuid) {
    return resolveThreeImportedClipForTarget({
      clipReference: reference,
      sourceAsset,
      sourceRoot: input.body,
      sourceAnimations: importedAnimations(input.body),
      sourceImport: input.targetSettings.value!,
      targetAsset: input.targetAsset,
      targetRoot: input.body,
      targetImport: input.targetSettings.value!,
      targetAvatar,
      importedAssets: input.catalog.importedAssets,
      playbackMode,
    });
  }
  if (!targetAvatar) return characterRuntimeFailure(
    "missing-target-avatar",
    `External clip ${assetRefKey(reference)} requires a target Avatar.`,
  );
  const sourceLease = input.acquireSource(sourceGuid);
  const sourceSettingsPromise = input.settings.get(sourceGuid);
  if (!sourceLease || !sourceSettingsPromise) {
    return capacityFailure(
      sourceGuid,
      THREE_ANIMATOR_PLAYBACK_LIMITS.maximumExternalSourceModels,
    );
  }
  try {
    const [source, sourceSettings] = await Promise.all([sourceLease.value, sourceSettingsPromise]);
    if (!source.value) return { value: null, diagnostics: source.diagnostics };
    if (!sourceSettings.value) return { value: null, diagnostics: sourceSettings.diagnostics };
    return resolveThreeImportedClipForTarget({
      clipReference: reference,
      sourceAsset,
      sourceRoot: source.value.object,
      sourceAnimations: source.value.animations,
      sourceImport: sourceSettings.value,
      targetAsset: input.targetAsset,
      targetRoot: input.body,
      targetAvatar,
      targetImport: input.targetSettings.value!,
      importedAssets: input.catalog.importedAssets,
      playbackMode,
    });
  } finally {
    sourceLease.release();
  }
}

function importedAnimations(body: THREE.Object3D): readonly THREE.AnimationClip[] {
  const value = body.userData.animationClips;
  return Array.isArray(value) ? value as THREE.AnimationClip[] : [];
}

function capacityFailure<T>(guid: string, limit: number): CharacterRuntimeResult<T> {
  return characterRuntimeFailure(
    "animator-playback-asset-capacity",
    `Model ${guid} falls outside the bounded ${limit}-model Play snapshot.`,
  );
}
