import * as THREE from "three";
import { BOT_ASSET_PREP_VERSION, isAvatarBotAssetUrl } from "../lib/bots";
import type { PrimitiveKind } from "../types";
import { prepareImportedAsset } from "./import-prepare";
import { stampImportedMaterialSlots as stampSlots } from "./import-materials";
import { importSanitizerChanged, sanitizeImportedAsset } from "./import-sanitize";
import { loadModelImportSettings } from "./model-import-settings";
import { applyThreeRigImportPolicies } from "../character/adapters/three/three-rig-import-policy";
import type { CharacterDiagnostic } from "../character/domain/diagnostics";
import { applyAnimationImportPolicy } from "./animation-import-policy";
import { isModelAnimationSourcePreviewUrl, type ModelImportSettings } from "../lib/model-import-settings";
import {
  disposeImportedAssetSource,
  estimateImportedAssetBytes,
  type ImportedAssetSource,
} from "./resources/imported-asset-lifetime";
import {
  LeasedResourceCache,
  type ResourceCacheDiagnostics,
  type ResourceLease,
} from "./resources/leased-resource-cache";
import { loadImportedModelSource } from "./imported-model-source-loader";

export {
  extractImportedMaterialDescriptors,
  stampImportedMaterialSlots,
} from "./import-materials";
export type {
  ImportedMaterialDescriptor,
  ImportedTextureDescriptor,
  ImportedTextureKind,
} from "./import-materials";

export type LoadedAsset = ImportedAssetSource;

export type AssetAnimationClipInfo = {
  id: string;
  sourceUrl: string;
  sourceType: PrimitiveKind;
  name: string;
  duration: number;
  trackCount: number;
  index: number;
};

const MAX_IDLE_ASSET_SOURCES = 4;
const MAX_IDLE_ASSET_BYTES = 128 * 1024 * 1024;
type AssetLoader = (assetUrl: string, primitive: PrimitiveKind) => Promise<LoadedAsset>;
export type AssetLease = ResourceLease<Promise<LoadedAsset>>;
export type AssetResourcePool = {
  cache: LeasedResourceCache<Promise<LoadedAsset>>;
  load: AssetLoader;
};
export type AssetCache = {
  acquire: (assetUrl: string, primitive: PrimitiveKind) => AssetLease;
  dispose: () => void;
};
const unsupportedFbxMapWarning = /(ReflectionFactor|ShininessExponent|EmissiveFactor|AmbientColor|TransparentColor) map is not supported/i;
let warningSuppressionUsers = 0;
let warningSuppressionBase: typeof console.warn | null = null;

const filteredAssetWarning: typeof console.warn = (message?: unknown, ...rest: unknown[]) => {
  if (typeof message === "string" && unsupportedFbxMapWarning.test(message)) return;
  warningSuppressionBase?.call(console, message, ...rest);
};

function acquireAssetWarningFilter(): () => void {
  if (warningSuppressionUsers === 0) {
    warningSuppressionBase = console.warn;
    console.warn = filteredAssetWarning;
  }
  warningSuppressionUsers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    warningSuppressionUsers = Math.max(0, warningSuppressionUsers - 1);
    if (warningSuppressionUsers !== 0) return;
    // Do not clobber a logger installed by another subsystem while an asset
    // was loading. We only restore the wrapper that we own.
    if (console.warn === filteredAssetWarning && warningSuppressionBase) {
      console.warn = warningSuppressionBase;
    }
    warningSuppressionBase = null;
  };
}

// FBX carries texture types Three.js doesn't render (Phong-era specular
// controls, env-reflection factors). Models load correctly without them;
// the warnings just clutter the console.
export function fitAndStripWarnings<T>(work: () => Promise<T>): Promise<T> {
  const release = acquireAssetWarningFilter();
  try {
    return work().finally(release);
  } catch (error) {
    release();
    return Promise.reject(error);
  }
}

export function describeAnimationClips(
  animations: THREE.AnimationClip[],
  sourceUrl: string,
  sourceType: PrimitiveKind,
): AssetAnimationClipInfo[] {
  return animations.map((clip, index) => {
    const name = clip.name || `Clip ${index + 1}`;
    return {
      id: `${sourceUrl}#${index}:${name}`,
      sourceUrl,
      sourceType,
      name,
      duration: Math.max(0, clip.duration),
      trackCount: clip.tracks.length,
      index,
    };
  });
}

export function loadAndPrepareAsset(assetUrl: string, primitive: PrimitiveKind, capturedSettings?: ModelImportSettings, strictDependencies = false): Promise<LoadedAsset> {
  return fitAndStripWarnings(async () => {
    const manager = strictDependencies ? new THREE.LoadingManager() : undefined;
    const failures: string[] = [];
    const dependenciesReady = manager ? new Promise<void>((resolve) => { manager.onLoad = resolve; }) : Promise.resolve();
    if (manager) manager.onError = (url) => { if (failures.length < 8) failures.push(url); };
    // Hold the manager open across parsing, including FileLoader request deduplication.
    manager?.itemStart("braze:model-preparation");
    const source = await loadImportedModelSource(assetUrl, primitive, manager)
      .finally(() => manager?.itemEnd("braze:model-preparation"));
    const { object: loaded, animations } = source;
    try {
      await dependenciesReady;
      if (failures.length) throw new Error(`Model dependencies failed to load: ${failures.join(", ")}`);
      const settings = capturedSettings ?? await loadModelImportSettings(assetUrl);
      const report = sanitizeImportedAsset(loaded, {
        importCameras: settings.importCameras,
        importLights: settings.importLights,
      });
      if (importSanitizerChanged(report)) console.info("Imported asset sanitized", { assetUrl, report });
      // Capture importer identity only after untrusted userData is stripped,
      // but before hierarchy preparation can reorder or flatten the graph.
      source.stampSubAssetBindings();
      stampSlots(loaded);
      loaded.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.originalMaterial = mesh.material;
      });
      const rigImport = applyThreeRigImportPolicies(loaded, animations, settings.rig);
      const sourcePreview = isModelAnimationSourcePreviewUrl(assetUrl);
      const animationImport = sourcePreview
        ? { animations: rigImport.animations, diagnostics: [], changed: false }
        : applyAnimationImportPolicy(rigImport.animations, {
            compression: settings.animationCompression,
            clipSettings: settings.clipSettings,
          });
      const preparation = prepareImportedAsset(loaded, settings, {
        botAsset: isAvatarBotAssetUrl(assetUrl),
        importedLibraryAsset: /\/3d-models\/imported-library\//.test(assetUrl),
      });
      const characterDiagnostics: CharacterDiagnostic[] = [
        ...rigImport.diagnostics,
        ...animationImport.diagnostics,
      ];
      if (preparation.preservedSkinnedHierarchy) characterDiagnostics.push({
        code: "skinned-hierarchy-preserved",
        severity: "warning",
        message: "Preserve Hierarchy was kept on because flattening a skinned skeleton would invalidate its bone bindings.",
      });
      return {
        object: loaded,
        animations: settings.importAnimations ? [...animationImport.animations] : [],
        ...(characterDiagnostics.length > 0 ? { characterDiagnostics } : {}),
      };
    } catch (error) {
      disposeImportedAssetSource({ object: loaded, animations });
      throw error;
    }
  });
}

export function createAssetResourcePool(load: AssetLoader = loadAndPrepareAsset): AssetResourcePool {
  return {
    load,
    cache: new LeasedResourceCache<Promise<LoadedAsset>>({
      maxIdleEntries: MAX_IDLE_ASSET_SOURCES,
      maxIdleBytes: MAX_IDLE_ASSET_BYTES,
      dispose: (promise) => void promise.then(disposeImportedAssetSource, () => undefined),
    }),
  };
}

const sharedAssetPool = createAssetResourcePool();

function assetCacheKey(assetUrl: string, primitive: PrimitiveKind): string {
  const preparation = isAvatarBotAssetUrl(assetUrl) ? `:${BOT_ASSET_PREP_VERSION}` : "";
  return `${primitive}:${assetUrl}${preparation}`;
}

export function createAssetCache(pool: AssetResourcePool = sharedAssetPool): AssetCache {
  const leases = new Set<AssetLease>();
  let disposed = false;
  return {
    acquire: (assetUrl, primitive) => {
      if (disposed) throw new Error("Cannot acquire an asset from a disposed viewport cache");
      const key = assetCacheKey(assetUrl, primitive);
      let created!: Promise<LoadedAsset>;
      const sharedLease = pool.cache.acquire(key, () => {
        created = pool.load(assetUrl, primitive);
        void created.then(
          (source) => pool.cache.updateEstimatedBytes(key, created, estimateImportedAssetBytes(source)),
          () => pool.cache.invalidate(key, created, "failed"),
        );
        return created;
      });
      let released = false;
      const lease: AssetLease = {
        value: sharedLease.value,
        release: () => {
          if (released) return;
          released = true;
          leases.delete(lease);
          sharedLease.release();
        },
      };
      leases.add(lease);
      return lease;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      [...leases].forEach((lease) => lease.release());
    },
  };
}

export function assetResourceDiagnostics(): ResourceCacheDiagnostics {
  return sharedAssetPool.cache.diagnostics();
}
