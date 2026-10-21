import {
  createEmptyCharacterAssetLibrary,
  type CharacterAssetLibrary,
} from "../domain/character-asset-library";
import {
  decodeCharacterAssetLibrary,
  encodeCharacterAssetLibrary,
} from "./character-asset-library-codec";

export const CHARACTER_ASSET_PROJECT_SECTION = "characterAssets" as const;

const owns = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

/** Reads the canonical section, or supported pre-section root aliases, without touching other project fields. */
export function characterAssetLibraryFromProject(
  project: Readonly<Record<string, unknown>>,
  fallback: CharacterAssetLibrary = createEmptyCharacterAssetLibrary(),
): CharacterAssetLibrary {
  if (owns(project, CHARACTER_ASSET_PROJECT_SECTION)) {
    return decodeCharacterAssetLibrary(project[CHARACTER_ASSET_PROJECT_SECTION]);
  }
  const hasLegacy = owns(project, "animatorControllers") || owns(project, "avatarMasks");
  if (!hasLegacy) return fallback;
  return decodeCharacterAssetLibrary({
    version: "braze/character-assets-v0",
    animatorControllers: project.animatorControllers,
    avatarMasks: project.avatarMasks,
  });
}

export const characterAssetLibraryProjectValue = encodeCharacterAssetLibrary;
