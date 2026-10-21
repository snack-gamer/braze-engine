import {
  createDeterministicAuthoredGuid,
  createDeterministicAuthoredId,
} from "../../identity/authored-id";
import {
  type AuthoredAnimatorController,
  type AuthoredAvatarMask,
  type CharacterAssetLibrary,
} from "../domain/character-asset-library";
import {
  CharacterCodecError,
  documentRecord,
  optionalString,
  preservedDocumentFields,
} from "./character-codec-values";
import {
  decodeAnimatorController,
  encodeAnimatorController,
} from "./animator-controller-codec";
import { decodeAvatarMaskAsset, encodeAvatarMaskAsset } from "./avatar-mask-codec";

export const CHARACTER_ASSET_LIBRARY_FORMAT = "braze/character-assets-v1";
const LEGACY_CHARACTER_ASSET_LIBRARY_FORMAT = "braze/character-assets-v0";
const ASSET_GUID = /^[a-f0-9]{32}$/;
const LIBRARY_FIELDS = [
  "version",
  "animatorControllers", "animator_controllers", "controllers",
  "avatarMasks", "avatar_masks", "masks",
] as const;

function assetList(value: unknown, path: string): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new CharacterCodecError("invalid-document", path, "expected an array");
  }
  return value;
}

function canonicalPersistedValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalPersistedValue).join(",")}]`;
  if (typeof value !== "object") return JSON.stringify(value) ?? String(value);
  const input = value as Record<string, unknown>;
  return `{${Object.keys(input).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalPersistedValue(input[key])}`,
  ).join(",")}}`;
}

function legacyAssetSeed(input: Record<string, unknown>, kind: "controller" | "mask"): string {
  const sourceId = optionalString(input.id);
  if (sourceId) return `${kind}:legacy-id:${sourceId}`;
  const name = optionalString(input.name) ?? "unnamed";
  return `${kind}:legacy-name:${name}:${canonicalPersistedValue(input)}`;
}

function migratedIdentity(
  input: Record<string, unknown>,
  kind: "controller" | "mask",
  index: number,
  strict: boolean,
): { id: string; revision: string } {
  const sourceId = optionalString(input.id);
  const id = sourceId?.toLowerCase();
  if (strict && (!id || !ASSET_GUID.test(id))) {
    throw new CharacterCodecError("invalid-reference", `${kind}s[${index}].id`, "expected an asset GUID");
  }
  const canonicalId = id && ASSET_GUID.test(id)
    ? id
    : createDeterministicAuthoredGuid(legacyAssetSeed(input, kind));
  const revision = optionalString(input.revision);
  if (strict && !revision) {
    throw new CharacterCodecError("invalid-document", `${kind}s[${index}].revision`, "expected a revision");
  }
  return {
    id: canonicalId,
    revision: revision ?? createDeterministicAuthoredId(
      "character-revision",
      `${canonicalId}:${canonicalPersistedValue(input)}`,
    ),
  };
}

function decodeControllers(value: unknown, strict: boolean): AuthoredAnimatorController[] {
  return assetList(value, "animatorControllers").map((raw, index) => {
    const input = documentRecord(raw, `animatorControllers[${index}]`);
    const identity = migratedIdentity(input, "controller", index, strict);
    return decodeAnimatorController({ ...input, ...identity }) as AuthoredAnimatorController;
  });
}

function decodeMasks(value: unknown, strict: boolean): AuthoredAvatarMask[] {
  return assetList(value, "avatarMasks").map((raw, index) => {
    const input = documentRecord(raw, `avatarMasks[${index}]`);
    const identity = migratedIdentity(input, "mask", index, strict);
    return decodeAvatarMaskAsset({ ...input, ...identity }) as AuthoredAvatarMask;
  });
}

function validateUniqueAssetIds(library: CharacterAssetLibrary): void {
  const seen = new Set<string>();
  for (const asset of [...library.animatorControllers, ...library.avatarMasks]) {
    if (!ASSET_GUID.test(asset.id)) {
      throw new CharacterCodecError("invalid-reference", `assets.${asset.id}`, "expected an asset GUID");
    }
    if (seen.has(asset.id)) {
      throw new CharacterCodecError("invalid-document", "assets", `duplicate asset id ${asset.id}`);
    }
    seen.add(asset.id);
    if (!asset.revision.trim()) {
      throw new CharacterCodecError("invalid-document", `assets.${asset.id}.revision`, "expected a revision");
    }
  }
}

/** Decodes the project-owned character section and deterministically migrates v0 aliases. */
export function decodeCharacterAssetLibrary(value: unknown): CharacterAssetLibrary {
  const input = value === undefined || value === null ? {} : documentRecord(value, "characterAssets");
  const version = input.version;
  const strict = version === CHARACTER_ASSET_LIBRARY_FORMAT || version === 1;
  if (
    version !== undefined
    && version !== 1
    && version !== CHARACTER_ASSET_LIBRARY_FORMAT
    && version !== LEGACY_CHARACTER_ASSET_LIBRARY_FORMAT
  ) {
    throw new CharacterCodecError("unsupported-version", "characterAssets.version", `unsupported version ${String(version)}`);
  }
  const library: CharacterAssetLibrary = {
    version: 1,
    animatorControllers: decodeControllers(
      input.animatorControllers ?? input.animator_controllers ?? input.controllers,
      strict,
    ),
    avatarMasks: decodeMasks(input.avatarMasks ?? input.avatar_masks ?? input.masks, strict),
    extensions: preservedDocumentFields(input, LIBRARY_FIELDS),
  };
  validateUniqueAssetIds(library);
  return library;
}

export function encodeCharacterAssetLibrary(library: CharacterAssetLibrary) {
  validateUniqueAssetIds(library);
  return {
    ...library.extensions,
    version: CHARACTER_ASSET_LIBRARY_FORMAT,
    animatorControllers: library.animatorControllers.map(encodeAnimatorController),
    avatarMasks: library.avatarMasks.map(encodeAvatarMaskAsset),
  };
}
