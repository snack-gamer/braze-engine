import {
  normalizeImmutableModelImportSettings,
  type ModelImportSettings,
} from "../lib/model-import-settings";
import { normalizeModelImportFilename } from "../assets/domain/model-import-filename";

type ImportSettingsResponse = {
  status: string;
  import?: {
    settings?: unknown;
    importVersion?: string;
  };
};

const settingsCache = new Map<string, Promise<ModelImportSettings>>();
type BundledSettingsLayer = {
  readonly settings: ModelImportSettings;
  readonly previous: BundledSettingsLayer | undefined;
  active: boolean;
};

const bundledSettings = new Map<string, BundledSettingsLayer>();
const fallbackModelImportSettings = normalizeImmutableModelImportSettings(undefined);
const MAX_CACHED_IMPORT_SETTINGS = 128;

function retainRecentSetting(key: string, value: Promise<ModelImportSettings>): void {
  settingsCache.delete(key);
  settingsCache.set(key, value);
  while (settingsCache.size > MAX_CACHED_IMPORT_SETTINGS) {
    const oldest = settingsCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    settingsCache.delete(oldest);
  }
}

function assetFilenameFromUrl(assetUrl: string): string | null {
  try {
    const location = window.location.href;
    const parsed = new URL(assetUrl, location);
    const marker = "/3d-models/";
    const relativeAssetRoot = new URL(`.${marker}`, location).pathname;
    const knownRoots = [...new Set([relativeAssetRoot, marker])]
      .sort((left, right) => right.length - left.length);
    const knownRoot = knownRoots.find((root) => parsed.pathname.startsWith(root));
    if (knownRoot) return decodeURIComponent(parsed.pathname.slice(knownRoot.length));
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

/** Installs immutable importer settings emitted with a production player package. */
export function installBundledModelImportSettings(
  settings: Readonly<Record<string, unknown>>,
): () => void {
  const prepared = prepareBundledSettings(settings);
  const installed: Array<readonly [string, BundledSettingsLayer]> = [];
  for (const [filename, value] of prepared) {
    const layer: BundledSettingsLayer = {
      settings: value,
      previous: bundledSettings.get(filename),
      active: true,
    };
    installed.push([filename, layer]);
    bundledSettings.set(filename, layer);
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const [filename, layer] of installed) {
      layer.active = false;
      if (bundledSettings.get(filename) !== layer) continue;
      const predecessor = nearestActivePredecessor(layer.previous);
      if (predecessor) bundledSettings.set(filename, predecessor);
      else bundledSettings.delete(filename);
    }
  };
}

export async function loadModelImportSettings(assetUrl: string): Promise<ModelImportSettings> {
  const sourceFilename = assetFilenameFromUrl(assetUrl);
  const filename = sourceFilename ? normalizeModelImportFilename(sourceFilename) : null;
  if (!filename) return fallbackModelImportSettings;
  const bundled = bundledSettings.get(filename)?.settings;
  if (bundled) return bundled;
  const cacheKey = `${filename}:${new URL(assetUrl, window.location.href).searchParams.get("importVersion") ?? ""}`;
  let promise = settingsCache.get(cacheKey);
  if (promise) retainRecentSetting(cacheKey, promise);
  if (!promise) {
    promise = fetch(`/api/assets/import-settings?filename=${encodeURIComponent(filename)}`)
      .then(async (response) => {
        const data = await response.json() as ImportSettingsResponse;
        if (!response.ok || data.status !== "ok") return fallbackModelImportSettings;
        return normalizeImmutableModelImportSettings(data.import?.settings);
      })
      .catch(() => fallbackModelImportSettings);
    retainRecentSetting(cacheKey, promise);
  }
  return promise;
}

function nearestActivePredecessor(
  layer: BundledSettingsLayer | undefined,
): BundledSettingsLayer | undefined {
  let current = layer;
  while (current && !current.active) current = current.previous;
  return current;
}

function prepareBundledSettings(
  settings: Readonly<Record<string, unknown>>,
): readonly (readonly [string, ModelImportSettings])[] {
  const prepared: Array<readonly [string, ModelImportSettings]> = [];
  const sourceKeyByFilename = new Map<string, string>();
  for (const [sourceKey, raw] of Object.entries(settings)) {
    const filename = normalizeModelImportFilename(sourceKey);
    if (!filename) {
      throw new Error(`Invalid bundled model import settings filename ${JSON.stringify(sourceKey)}.`);
    }
    const previousSource = sourceKeyByFilename.get(filename);
    if (previousSource !== undefined) {
      throw new Error(
        `Bundled model import settings filenames ${JSON.stringify(previousSource)} and ${JSON.stringify(sourceKey)} normalize to the same key ${JSON.stringify(filename)}.`,
      );
    }
    sourceKeyByFilename.set(filename, sourceKey);
    prepared.push([filename, normalizeImmutableModelImportSettings(raw)]);
  }
  return prepared;
}
