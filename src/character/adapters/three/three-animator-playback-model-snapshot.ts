import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import { fetchModelImport } from "../../../lib/asset-api";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { Runtime } from "../../../three/runtime";
import {
  animatorControllerClipReferences,
  resolveAnimatorControllerDefinition,
} from "../../application/playback/animator-playback-resolution";
import type { CharacterAssetLibrary } from "../../domain/character-asset-library";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";
import { THREE_ANIMATOR_PLAYBACK_LIMITS } from "./three-animator-playback-limits";
import {
  ThreeAnimatorSourceLeaseCache,
  type ThreeAnimatorSourceLease,
} from "./three-animator-source-lease-cache";

export type ThreeAnimatorPlaybackModelDependencies = Readonly<{
  targets: ReadonlySet<string>;
  external: ReadonlySet<string>;
}>;

export type ThreeAnimatorPlaybackModelSnapshot = Readonly<{
  models: ReadonlyMap<string, LibraryAsset>;
  settings: ReadonlyMap<string, Promise<CharacterRuntimeResult<ModelImportDocument>>>;
  acquireSource: (guid: string) => ThreeAnimatorSourceLease | null;
  isDisposed: () => boolean;
  dispose: () => void;
}>;

type ModelSnapshotInput = Readonly<{
  runtime: Pick<Runtime, "assetCache" | "disposed">;
  assets: readonly LibraryAsset[];
  objects: readonly SceneObject[];
  library: CharacterAssetLibrary;
  loadModelImport?: (filename: string) => Promise<ModelImportDocument>;
}>;

/** Owns bounded model selection, import snapshots, and external source leases for one Play lifetime. */
export function createThreeAnimatorPlaybackModelSnapshot(
  input: ModelSnapshotInput,
): ThreeAnimatorPlaybackModelSnapshot {
  const models = uniqueModelsByGuid(input.assets);
  const dependencies = playbackModelDependencies(input.objects, input.library);
  const selectedGuids = selectedPlaybackModelGuids(dependencies);
  const externalGuids = [...dependencies.external].sort()
    .slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumExternalSourceModels);
  const loadImport = input.loadModelImport ?? fetchModelImport;
  const settings = new Map(selectedGuids.flatMap((guid) => {
    const asset = models.get(guid);
    return asset ? [[guid, snapshotImport(loadImport, asset)]] : [];
  }));
  let disposed = false;
  const external = new Set(externalGuids);
  const sources = new ThreeAnimatorSourceLeaseCache(
    input.runtime,
    THREE_ANIMATOR_PLAYBACK_LIMITS.maximumResidentExternalSources,
  );

  return {
    models,
    settings,
    acquireSource: (guid) => {
      const normalized = guid.toLowerCase();
      if (disposed || !external.has(normalized)) return null;
      const asset = models.get(normalized);
      const document = settings.get(normalized);
      return asset && document ? sources.acquire(asset, document) : null;
    },
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      sources.dispose();
      settings.clear();
    },
  };
}

export function playbackModelDependencies(
  objects: readonly SceneObject[],
  library: CharacterAssetLibrary,
): ThreeAnimatorPlaybackModelDependencies {
  const targets = new Set<string>();
  const external = new Set<string>();
  for (const object of objects) {
    if (!object.animator) continue;
    const targetGuid = object.assetRef?.guid.toLowerCase();
    if (targetGuid) targets.add(targetGuid);
    const controller = resolveAnimatorControllerDefinition(object.animator, library);
    if (!controller) continue;
    for (const clip of animatorControllerClipReferences(controller)) {
      const guid = clip.guid.toLowerCase();
      if (guid !== targetGuid) external.add(guid);
    }
  }
  return { targets, external };
}

export function selectedPlaybackModelGuids(
  dependencies: ThreeAnimatorPlaybackModelDependencies,
): string[] {
  const targets = [...dependencies.targets].sort()
    .slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumLiveSessions);
  const targetSet = new Set(targets);
  const external = [...dependencies.external]
    .filter((guid) => !targetSet.has(guid))
    .sort()
    .slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumExternalSourceModels);
  return [...targets, ...external]
    .slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumSnapshotModels);
}

function uniqueModelsByGuid(assets: readonly LibraryAsset[]): Map<string, LibraryAsset> {
  const models = new Map<string, LibraryAsset>();
  const duplicates = new Set<string>();
  for (const asset of assets) {
    const guid = asset.guid?.toLowerCase();
    if (!guid || duplicates.has(guid)) continue;
    if (models.has(guid)) {
      models.delete(guid);
      duplicates.add(guid);
    } else models.set(guid, asset);
  }
  return models;
}

function snapshotImport(
  load: (filename: string) => Promise<ModelImportDocument>,
  asset: LibraryAsset,
): Promise<CharacterRuntimeResult<ModelImportDocument>> {
  return load(asset.filename).then(
    (document) => characterRuntimeSuccess(document),
    (error) => characterRuntimeFailure(
      "model-import-snapshot-failed",
      `Could not snapshot import settings for ${asset.filename}: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}
