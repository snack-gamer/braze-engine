import type { AssetRef } from "../../assets/domain/asset-reference";
import { createAuthoredGuid, createAuthoredId } from "../../identity/authored-id";
import {
  type AuthoredAnimatorController,
  type AuthoredAvatarMask,
  type CharacterAssetKind,
  type CharacterAssetLibrary,
  type CharacterAssetRecord,
} from "../domain/character-asset-library";
import { createAnimatorController, type AnimatorController } from "../domain/animator-controller";
import type { AvatarMaskAsset } from "../domain/avatar-mask";
import {
  createAnimatorControllerFromClips,
  type AnimatorControllerClipSeed,
} from "./animator-controller-seeding";

export type { AnimatorControllerClipSeed } from "./animator-controller-seeding";

const ASSET_GUID = /^[a-f0-9]{32}$/;

export class CharacterAssetRevisionConflictError extends Error {
  readonly kind: CharacterAssetKind;
  readonly id: string;
  readonly expectedRevision: string;
  readonly actualRevision: string;

  constructor(kind: CharacterAssetKind, id: string, expectedRevision: string, actualRevision: string) {
    super(`${kind} '${id}' changed from revision '${expectedRevision}' to '${actualRevision}'.`);
    this.name = "CharacterAssetRevisionConflictError";
    this.kind = kind;
    this.id = id;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class CharacterAssetNotFoundError extends Error {
  constructor(readonly kind: CharacterAssetKind, readonly id: string) {
    super(`${kind} '${id}' does not exist.`);
    this.name = "CharacterAssetNotFoundError";
  }
}

export type CharacterAssetMutation<T> = {
  library: CharacterAssetLibrary;
  asset: T;
};

export type NewCharacterAssetIdentity = { id?: string; revision?: string };
export type AnimatorControllerAssetPatch = Partial<Omit<AnimatorController, "version" | "id" | "revision">>;
export type AvatarMaskAssetPatch = Partial<Omit<AvatarMaskAsset, "version" | "id" | "revision">>;

function cloneAuthoredValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneAuthoredValue) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneAuthoredValue(child)]),
  ) as T;
}

function assetIdentity(identity: NewCharacterAssetIdentity): { id: string; revision: string } {
  const id = (identity.id ?? createAuthoredGuid()).toLowerCase();
  const revision = identity.revision ?? createAuthoredId("character-revision");
  if (!ASSET_GUID.test(id)) throw new Error("Character asset identity must be a 32-character GUID.");
  if (!revision.trim()) throw new Error("Character asset revision must be non-empty.");
  return { id, revision };
}

function nextRevision(current: string, requested?: string): string {
  const revision = requested ?? createAuthoredId("character-revision");
  if (!revision.trim() || revision === current) {
    throw new Error("A character asset update must provide a new non-empty revision.");
  }
  return revision;
}

function assertCurrentRevision(
  kind: CharacterAssetKind,
  asset: { id: string; revision: string } | undefined,
  id: string,
  expectedRevision: string,
): asserts asset is { id: string; revision: string } {
  if (!asset) throw new CharacterAssetNotFoundError(kind, id);
  if (asset.revision !== expectedRevision) {
    throw new CharacterAssetRevisionConflictError(kind, id, expectedRevision, asset.revision);
  }
}

export function createAnimatorControllerAsset(
  library: CharacterAssetLibrary,
  name = "Animator Controller",
  identity: NewCharacterAssetIdentity = {},
): CharacterAssetMutation<AuthoredAnimatorController> {
  const { id, revision } = assetIdentity(identity);
  if (resolveCharacterAssetReference(library, { guid: id })) {
    throw new Error(`Character asset '${id}' already exists.`);
  }
  const asset: AuthoredAnimatorController = { ...createAnimatorController(id, name), revision };
  return {
    library: { ...library, animatorControllers: [...library.animatorControllers, asset] },
    asset,
  };
}

/** Creates one playable default-state controller without exposing mutation sequencing to UI code. */
export function createAnimatorControllerAssetFromClips(
  library: CharacterAssetLibrary,
  clips: readonly AnimatorControllerClipSeed[],
  name = "Animator Controller",
  identity: NewCharacterAssetIdentity = {},
): CharacterAssetMutation<AuthoredAnimatorController> {
  const created = createAnimatorControllerAsset(library, name, identity);
  const controller = createAnimatorControllerFromClips(clips, name, created.asset.id);
  const asset: AuthoredAnimatorController = {
    ...controller,
    id: created.asset.id,
    revision: created.asset.revision,
  };
  return {
    asset,
    library: {
      ...created.library,
      animatorControllers: created.library.animatorControllers.map((candidate) => (
        candidate.id === asset.id ? asset : candidate
      )),
    },
  };
}

export function duplicateAnimatorControllerAsset(
  library: CharacterAssetLibrary,
  id: string,
  expectedRevision: string,
  identity: NewCharacterAssetIdentity = {},
): CharacterAssetMutation<AuthoredAnimatorController> {
  const current = library.animatorControllers.find((asset) => asset.id === id);
  assertCurrentRevision("animatorController", current, id, expectedRevision);
  const nextIdentity = assetIdentity(identity);
  if (resolveCharacterAssetReference(library, { guid: nextIdentity.id })) {
    throw new Error(`Character asset '${nextIdentity.id}' already exists.`);
  }
  const asset: AuthoredAnimatorController = {
    ...cloneAuthoredValue(current),
    id: nextIdentity.id,
    name: `${current.name} Copy`,
    revision: nextIdentity.revision,
  };
  return {
    asset,
    library: { ...library, animatorControllers: [...library.animatorControllers, asset] },
  };
}

export function updateAnimatorControllerAsset(
  library: CharacterAssetLibrary,
  id: string,
  expectedRevision: string,
  patch: AnimatorControllerAssetPatch,
  revision?: string,
): CharacterAssetMutation<AuthoredAnimatorController> {
  const current = library.animatorControllers.find((asset) => asset.id === id);
  assertCurrentRevision("animatorController", current, id, expectedRevision);
  const asset = cloneAuthoredValue({
    ...current,
    ...patch,
    version: 1 as const,
    id: current.id,
    revision: nextRevision(current.revision, revision),
  });
  return {
    library: {
      ...library,
      animatorControllers: library.animatorControllers.map((candidate) => candidate.id === id ? asset : candidate),
    },
    asset,
  };
}

export function removeAnimatorControllerAsset(
  library: CharacterAssetLibrary,
  id: string,
  expectedRevision: string,
): CharacterAssetLibrary {
  const current = library.animatorControllers.find((asset) => asset.id === id);
  assertCurrentRevision("animatorController", current, id, expectedRevision);
  return {
    ...library,
    animatorControllers: library.animatorControllers.filter((asset) => asset.id !== id),
  };
}

export function createAvatarMaskAsset(
  library: CharacterAssetLibrary,
  name = "Avatar Mask",
  identity: NewCharacterAssetIdentity = {},
): CharacterAssetMutation<AuthoredAvatarMask> {
  const { id, revision } = assetIdentity(identity);
  if (resolveCharacterAssetReference(library, { guid: id })) {
    throw new Error(`Character asset '${id}' already exists.`);
  }
  const asset: AuthoredAvatarMask = {
    version: 1,
    id,
    name,
    revision,
    humanoidBodyParts: {},
    transforms: [],
  };
  return {
    library: { ...library, avatarMasks: [...library.avatarMasks, asset] },
    asset,
  };
}

export function duplicateAvatarMaskAsset(
  library: CharacterAssetLibrary,
  id: string,
  expectedRevision: string,
  identity: NewCharacterAssetIdentity = {},
): CharacterAssetMutation<AuthoredAvatarMask> {
  const current = library.avatarMasks.find((asset) => asset.id === id);
  assertCurrentRevision("avatarMask", current, id, expectedRevision);
  const nextIdentity = assetIdentity(identity);
  if (resolveCharacterAssetReference(library, { guid: nextIdentity.id })) {
    throw new Error(`Character asset '${nextIdentity.id}' already exists.`);
  }
  const asset: AuthoredAvatarMask = {
    ...cloneAuthoredValue(current),
    id: nextIdentity.id,
    name: `${current.name} Copy`,
    revision: nextIdentity.revision,
  };
  return {
    asset,
    library: { ...library, avatarMasks: [...library.avatarMasks, asset] },
  };
}

export function updateAvatarMaskAsset(
  library: CharacterAssetLibrary,
  id: string,
  expectedRevision: string,
  patch: AvatarMaskAssetPatch,
  revision?: string,
): CharacterAssetMutation<AuthoredAvatarMask> {
  const current = library.avatarMasks.find((asset) => asset.id === id);
  assertCurrentRevision("avatarMask", current, id, expectedRevision);
  const asset = cloneAuthoredValue({
    ...current,
    ...patch,
    version: 1 as const,
    id: current.id,
    revision: nextRevision(current.revision, revision),
  });
  return {
    library: {
      ...library,
      avatarMasks: library.avatarMasks.map((candidate) => candidate.id === id ? asset : candidate),
    },
    asset,
  };
}

export function removeAvatarMaskAsset(
  library: CharacterAssetLibrary,
  id: string,
  expectedRevision: string,
): CharacterAssetLibrary {
  const current = library.avatarMasks.find((asset) => asset.id === id);
  assertCurrentRevision("avatarMask", current, id, expectedRevision);
  return { ...library, avatarMasks: library.avatarMasks.filter((asset) => asset.id !== id) };
}

export function resolveCharacterAssetReference(
  library: CharacterAssetLibrary,
  reference: AssetRef,
): CharacterAssetRecord | undefined {
  if (reference.localId && reference.localId !== "main") return undefined;
  const guid = reference.guid.toLowerCase();
  const controller = library.animatorControllers.find((asset) => asset.id === guid);
  if (controller) return { kind: "animatorController", asset: controller };
  const mask = library.avatarMasks.find((asset) => asset.id === guid);
  return mask ? { kind: "avatarMask", asset: mask } : undefined;
}
