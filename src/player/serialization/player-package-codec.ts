import type { CharacterAssetLibrary } from "../../character/domain/character-asset-library";
import type { RuntimeModelImportDocument } from "../../assets/application/model-import-document-provider";
import { decodeImportedAssets, decodeModelImportDocuments, validateModelImportManifest } from "../../assets/serialization/model-import-manifest-codec";
import { decodeCharacterAssetLibrary } from "../../character/serialization/character-asset-library-codec";
import { defaultCamera, defaultEnvironment } from "../../constants";
import type { LibraryAsset } from "../../lib/asset-api";
import { normalizeProjectMaterials } from "../../materials/serialization/material-library-codec";
import {
  hydrateRuntimeSceneDocument,
  type HydratedSceneState,
} from "../../scene/application/scene-runtime-hydration";
import type { Material } from "../../types";

export const PLAYER_PACKAGE_VERSION = "braze-player/package-v1";

export type PlayerFeatures = Readonly<{
  modelLoaders: readonly ("fbx" | "gltf" | "usdz")[];
  animator: boolean;
  physics: boolean;
  particles: boolean;
  timeline: boolean;
  water: boolean;
  cloner: boolean;
  environment: "sky" | "hdri";
  effects: Readonly<{
    ao: boolean;
    bloom: boolean;
    ssr: boolean;
    clouds: boolean;
    godrays: boolean;
    scattering: boolean;
    fog: boolean;
  }>;
}>;

export type DecodedPlayerPackage = Readonly<{
  sceneId: string;
  scene: HydratedSceneState;
  materials: Material[];
  characterAssets: CharacterAssetLibrary;
  importedAssets: readonly LibraryAsset[];
  modelImportDocuments: Readonly<Record<string, RuntimeModelImportDocument>>;
  features: PlayerFeatures;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const own = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) own[key] = item;
  return own;
}

function requiredString(input: Record<string, unknown>, key: string, label: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}.${key} must be a string.`);
  return value;
}


function booleanFeature(input: Record<string, unknown>, key: string): boolean {
  if (typeof input[key] !== "boolean") throw new Error(`player features.${key} must be boolean.`);
  return input[key];
}

function decodeFeatures(value: unknown): PlayerFeatures {
  const input = record(value, "player features");
  const effects = record(input.effects, "player features.effects");
  if (!Array.isArray(input.modelLoaders)) {
    throw new Error("player features.modelLoaders must be an array.");
  }
  const modelLoaders: Array<"fbx" | "gltf" | "usdz"> = [];
  const seenLoaders = new Set<string>();
  for (const loader of input.modelLoaders) {
    if (loader !== "fbx" && loader !== "gltf" && loader !== "usdz") {
      throw new Error(`player features.modelLoaders contains unsupported loader ${JSON.stringify(loader)}.`);
    }
    if (seenLoaders.has(loader)) {
      throw new Error(`player features.modelLoaders contains duplicate loader ${JSON.stringify(loader)}.`);
    }
    seenLoaders.add(loader);
    modelLoaders.push(loader);
  }
  const environment = input.environment;
  if (environment !== "sky" && environment !== "hdri") {
    throw new Error("player features.environment must be sky or hdri.");
  }
  return {
    modelLoaders,
    animator: booleanFeature(input, "animator"),
    physics: booleanFeature(input, "physics"),
    particles: booleanFeature(input, "particles"),
    timeline: booleanFeature(input, "timeline"),
    water: booleanFeature(input, "water"),
    cloner: booleanFeature(input, "cloner"),
    environment,
    effects: {
      ao: booleanFeature(effects, "ao"),
      bloom: booleanFeature(effects, "bloom"),
      ssr: booleanFeature(effects, "ssr"),
      clouds: booleanFeature(effects, "clouds"),
      godrays: booleanFeature(effects, "godrays"),
      scattering: booleanFeature(effects, "scattering"),
      fog: booleanFeature(effects, "fog"),
    },
  };
}


export function decodePlayerPackage(value: unknown): DecodedPlayerPackage {
  const input = record(value, "player package");
  if (input.version !== PLAYER_PACKAGE_VERSION) {
    throw new Error(`Unsupported player package version ${String(input.version)}.`);
  }
  const importedAssets = decodeImportedAssets(input.importedAssets);
  const modelImportDocuments = decodeModelImportDocuments(input.modelImportDocuments);
  validateModelImportManifest(importedAssets, modelImportDocuments);
  const scene = hydrateRuntimeSceneDocument(input.scene, {
    camera: defaultCamera,
    environment: defaultEnvironment,
  }).state;
  return {
    sceneId: requiredString(input, "sceneId", "player package"),
    scene,
    materials: normalizeProjectMaterials(input.materials),
    characterAssets: decodeCharacterAssetLibrary(input.characterAssets),
    importedAssets,
    modelImportDocuments,
    features: decodeFeatures(input.features),
  };
}
