import type { ScenePlaybackMode } from "../../../types";
import type { LibraryAsset } from "../../../lib/asset-api";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { CharacterAssetLibrary } from "../../domain/character-asset-library";
import { resolveAnimatorControllerDefinition } from "../../application/playback/animator-playback-resolution";
import { THREE_ANIMATOR_PLAYBACK_LIMITS } from "./three-animator-playback-limits";
import {
  playbackModelDependencies,
  selectedPlaybackModelGuids,
  type ThreeAnimatorPlaybackCatalog,
} from "./three-animator-playback-resolver";

type SnapshotCatalog = (
  catalog: ThreeAnimatorPlaybackCatalog,
  objects: readonly SceneObject[],
) => ThreeAnimatorPlaybackCatalog;

/**
 * Captures one immutable asset catalog for a Play lifetime.
 *
 * Readiness may arrive after Play begins, but later authoring/import refreshes
 * must not change a running simulation. A viewport-runtime replacement reuses
 * the same snapshot until Edit mode establishes the next lifetime boundary.
 */
export class ThreeAnimatorPlaybackSnapshotLatch {
  private snapshot: ThreeAnimatorPlaybackCatalog | null = null;
  private objectSnapshot: readonly SceneObject[] | null = null;

  constructor(private readonly capture: SnapshotCatalog = snapshotThreeAnimatorPlaybackCatalog) {}

  reset(): void { this.snapshot = null; this.objectSnapshot = null; }

  resolve(
    mode: ScenePlaybackMode,
    ready: boolean,
    catalog: ThreeAnimatorPlaybackCatalog,
    objects: readonly SceneObject[],
  ): ThreeAnimatorPlaybackCatalog | null {
    if (mode === "edit") {
      this.reset();
      return null;
    }
    if (!this.objectSnapshot) {
      this.objectSnapshot = clonePlain(
        objects.filter((object) => object.animator?.enabled === true),
      );
    }
    if (!this.snapshot && ready) this.snapshot = this.capture(catalog, this.objectSnapshot);
    return this.snapshot;
  }

  /** Enabled authored objects captured at the current Play lifetime boundary. */
  playableObjects(): readonly SceneObject[] {
    return this.objectSnapshot ?? [];
  }
}

export function snapshotThreeAnimatorPlaybackCatalog(
  catalog: ThreeAnimatorPlaybackCatalog,
  objects: readonly SceneObject[],
): ThreeAnimatorPlaybackCatalog {
  const playable = objects
    .filter((object) => object.animator?.enabled === true)
    .slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumLiveSessions);
  const library = selectPlaybackLibrary(catalog.library, playable);
  const dependencies = playbackModelDependencies(playable, library);
  const primaryModelGuids = new Set(selectedPlaybackModelGuids(dependencies));
  const copiedAvatarGuids = copiedAvatarModelGuids(catalog.importedAssets, primaryModelGuids);
  const selectedModelGuids = new Set([...primaryModelGuids, ...copiedAvatarGuids]);
  return clonePlain({
    library,
    importedAssets: catalog.importedAssets.filter((asset) => (
      asset.guid && selectedModelGuids.has(asset.guid.toLowerCase())
    )),
  });
}

function selectPlaybackLibrary(
  library: CharacterAssetLibrary,
  objects: readonly SceneObject[],
): CharacterAssetLibrary {
  const controllerIds = new Set(objects.flatMap((object) => (
    object.animator?.controllerRef ? [object.animator.controllerRef.guid.toLowerCase()] : []
  )));
  const animatorControllers = library.animatorControllers.filter((controller) => (
    controllerIds.has(controller.id)
  ));
  const controllerDefinitions = objects.flatMap((object) => {
    const controller = object.animator
      ? resolveAnimatorControllerDefinition(object.animator, library)
      : undefined;
    return controller ? [controller] : [];
  });
  const maskIds = new Set(controllerDefinitions.flatMap((controller) => (
    controller.layers.flatMap((layer) => (
      layer.avatarMaskRef ? [layer.avatarMaskRef.guid.toLowerCase()] : []
    ))
  )));
  return {
    version: 1,
    animatorControllers,
    avatarMasks: library.avatarMasks.filter((mask) => maskIds.has(mask.id)),
    extensions: {},
  };
}

/** Copy-Avatar records are catalog-only validation dependencies, not loaded model sources. */
function copiedAvatarModelGuids(
  assets: readonly LibraryAsset[],
  primaryGuids: ReadonlySet<string>,
): readonly string[] {
  const copied = new Set<string>();
  for (const asset of assets) {
    if (!asset.guid || !primaryGuids.has(asset.guid.toLowerCase())) continue;
    for (const subAsset of asset.subAssets ?? []) {
      if (subAsset.kind !== "avatar") continue;
      const reference = record(subAsset.configuredAvatarRef);
      const guid = typeof reference?.guid === "string" ? reference.guid.toLowerCase() : "";
      if (/^[a-f0-9]{32}$/.test(guid)) copied.add(guid);
    }
  }
  return [...copied].sort().slice(0, THREE_ANIMATOR_PLAYBACK_LIMITS.maximumSnapshotModels);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clonePlain<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}
