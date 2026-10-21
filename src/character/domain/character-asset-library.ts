import type { AssetRef } from "../../assets/domain/asset-reference";
import type { AnimatorController } from "./animator-controller";
import type { AvatarMaskAsset } from "./avatar-mask";
import type { CharacterDocumentExtensions } from "./character-document";

export type AuthoredAnimatorController = AnimatorController & { revision: string };
export type AuthoredAvatarMask = AvatarMaskAsset & { revision: string };

/** Project-authored character assets. Imported rig artifacts remain in the asset index. */
export type CharacterAssetLibrary = {
  version: 1;
  animatorControllers: AuthoredAnimatorController[];
  avatarMasks: AuthoredAvatarMask[];
  extensions: CharacterDocumentExtensions;
};

export type CharacterAssetKind = "animatorController" | "avatarMask";

export type CharacterAssetRecord =
  | { kind: "animatorController"; asset: AuthoredAnimatorController }
  | { kind: "avatarMask"; asset: AuthoredAvatarMask };

export function createEmptyCharacterAssetLibrary(): CharacterAssetLibrary {
  return {
    version: 1,
    animatorControllers: [],
    avatarMasks: [],
    extensions: {},
  };
}

/** Authored library IDs are AssetRef GUIDs; each document is its main asset. */
export function characterAssetReference(asset: { id: string }): AssetRef {
  const guid = asset.id.toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(guid)) {
    throw new Error("Character asset identity is not AssetRef-compatible.");
  }
  return { guid, localId: "main" };
}
