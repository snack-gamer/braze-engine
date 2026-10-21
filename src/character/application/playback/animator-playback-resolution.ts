import type { AssetRef } from "../../../assets/domain/asset-reference";
import { resolveCharacterAssetReference } from "../character-asset-library";
import type { AnimatorComponent } from "../../domain/animator-component";
import type { AnimatorController } from "../../domain/animator-controller";
import { visitAnimatorMotions } from "../../domain/animator-state-machine";
import type { CharacterAssetLibrary } from "../../domain/character-asset-library";
import { assetRefKey } from "../../runtime/animator-controller-compiler";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import type {
  AnimatorPlaybackAssets,
  AnimatorPlaybackAvatar,
  AnimatorPlaybackClip,
} from "./animator-playback-contracts";

type AnimatorPlaybackResolutionPorts<TClip> = Readonly<{
  resolveClip: (reference: AssetRef) => CharacterRuntimeResult<AnimatorPlaybackClip<TClip>>;
  resolveAvatar?: (reference: AssetRef) => CharacterRuntimeResult<AnimatorPlaybackAvatar>;
}>;

/** Resolves durable refs before a runtime session is allowed to start. */
export function resolveAnimatorPlaybackAssets<TClip>(
  component: AnimatorComponent,
  library: CharacterAssetLibrary,
  ports: AnimatorPlaybackResolutionPorts<TClip>,
): CharacterRuntimeResult<AnimatorPlaybackAssets<TClip>> {
  const controller = resolveAnimatorControllerDefinition(component, library);
  if (!controller && !component.controllerRef) return characterRuntimeFailure(
    "missing-animator-controller",
    "Animator Controller has no embedded state machine.",
  );
  if (!controller) return characterRuntimeFailure(
    "unresolved-animator-controller",
    `Legacy Animator Controller ${assetRefKey(component.controllerRef)} could not be resolved.`,
  );

  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const clips: AnimatorPlaybackClip<TClip>[] = [];
  for (const reference of animatorControllerClipReferences(controller)) {
    const resolved = safeResolve("clip", reference, () => ports.resolveClip(reference));
    diagnostics.push(...resolved.diagnostics);
    if (!resolved.value) continue;
    const expectedId = assetRefKey(reference);
    if (resolved.value.id !== expectedId) {
      diagnostics.push({
        code: "mismatched-animation-clip",
        severity: "error",
        message: `Resolved clip ${resolved.value.id} does not match ${expectedId}.`,
      });
      continue;
    }
    clips.push(resolved.value);
  }

  const masks = [];
  const maskReferences = uniqueRefs(controller.layers.flatMap((layer) => (
    layer.avatarMaskRef ? [layer.avatarMaskRef] : []
  )));
  for (const reference of maskReferences) {
    const mask = resolveCharacterAssetReference(library, reference);
    if (!mask || mask.kind !== "avatarMask") diagnostics.push({
      code: "unresolved-avatar-mask",
      severity: "error",
      message: `Avatar Mask ${assetRefKey(reference)} could not be resolved.`,
    });
    else masks.push(mask.asset);
  }

  let avatar: AnimatorPlaybackAvatar | undefined;
  if (component.avatarRef) {
    if (!ports.resolveAvatar) diagnostics.push({
      code: "avatar-resolver-unavailable",
      severity: "error",
      message: `Avatar ${assetRefKey(component.avatarRef)} cannot be resolved by this runtime backend.`,
    });
    else {
      const resolved = safeResolve("avatar", component.avatarRef, () => ports.resolveAvatar!(component.avatarRef!));
      diagnostics.push(...resolved.diagnostics);
      avatar = resolved.value ?? undefined;
      if (avatar && avatar.id !== assetRefKey(component.avatarRef)) diagnostics.push({
        code: "mismatched-avatar",
        severity: "error",
        message: `Resolved Avatar ${avatar.id} does not match ${assetRefKey(component.avatarRef)}.`,
      });
    }
  }

  if (hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  return characterRuntimeSuccess({
    controller,
    clips,
    masks,
    ...(avatar ? { avatar } : {}),
  }, diagnostics);
}

/** Resolves an embedded state machine, or a pre-v2 Project reference during migration. */
export function resolveAnimatorControllerDefinition(
  component: AnimatorComponent,
  library: CharacterAssetLibrary,
): AnimatorController | undefined {
  if (!component.controllerRef) return component.controller;
  const record = resolveCharacterAssetReference(library, component.controllerRef);
  return record?.kind === "animatorController" ? record.asset : undefined;
}

export function animatorControllerClipReferences(
  controller: AnimatorController,
): AssetRef[] {
  const references: AssetRef[] = [];
  visitAnimatorMotions(controller, (motion) => {
    if (motion.kind === "clip") references.push(motion.clipRef);
  });
  return uniqueRefs(references);
}

function uniqueRefs(references: readonly AssetRef[]): AssetRef[] {
  const byId = new Map<string, AssetRef>();
  for (const reference of references) byId.set(assetRefKey(reference)!, reference);
  return [...byId.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, reference]) => reference);
}

function safeResolve<T>(
  kind: "clip" | "avatar",
  reference: AssetRef,
  resolve: () => CharacterRuntimeResult<T>,
): CharacterRuntimeResult<T> {
  try {
    return resolve();
  } catch (error) {
    return characterRuntimeFailure(
      `${kind}-resolution-failed`,
      `${kind === "clip" ? "Animation clip" : "Avatar"} ${assetRefKey(reference)} failed to resolve: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
