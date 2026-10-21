import type { AssetSubAsset } from "../../lib/asset-api";
import type {
  ModelAnimationClipSettings,
  ModelImportSettings,
} from "../../lib/model-import-settings";

export type ModelAnimationClipSource = Readonly<{
  localId: string;
  name: string;
  origin: "source" | "segment";
  sourceName: string;
  sourceIndex: number;
  sourceTakeLocalId: string;
  runtimeClipIndex: number | null;
  sourceLooping: boolean;
  frameRate: number | null;
  sourceFirstFrame: number | null;
  sourceLastFrame: number | null;
}>;

export type ResolvedModelAnimationClipSettings = Readonly<{
  name: string;
  looping: boolean;
  loopPose: boolean;
  firstFrame: number | null;
  lastFrame: number | null;
}>;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decodedClipSource(subAsset: AssetSubAsset): ModelAnimationClipSource | null {
  const sourceIndex = nonNegativeInteger(subAsset.sourceIndex);
  if (subAsset.kind !== "clip" || !subAsset.localId.trim() || sourceIndex === null) return null;
  const frameRate = finite(subAsset.frameRate);
  const sourceFirstFrame = finite(subAsset.sourceFirstFrame ?? subAsset.firstFrame);
  const sourceLastFrame = finite(subAsset.sourceLastFrame ?? subAsset.lastFrame);
  const validTiming = frameRate !== null
    && frameRate > 0
    && sourceFirstFrame !== null
    && sourceFirstFrame >= 0
    && sourceLastFrame !== null
    && sourceLastFrame > sourceFirstFrame;
  const sourceName = typeof subAsset.sourceName === "string" && subAsset.sourceName.trim()
    ? subAsset.sourceName.trim()
    : subAsset.name;
  const origin = subAsset.clipOrigin === "segment" ? "segment" : "source";
  const sourceTakeLocalId = typeof subAsset.sourceTakeLocalId === "string"
    && subAsset.sourceTakeLocalId.trim()
    ? subAsset.sourceTakeLocalId.trim()
    : origin === "source" ? subAsset.localId : "";
  if (!sourceTakeLocalId) return null;
  return {
    localId: subAsset.localId,
    name: subAsset.name,
    origin,
    sourceName,
    sourceIndex,
    sourceTakeLocalId,
    runtimeClipIndex: nonNegativeInteger(subAsset.runtimeClipIndex ?? subAsset.sourceIndex),
    sourceLooping: subAsset.sourceLooping === undefined
      ? subAsset.looping !== false
      : subAsset.sourceLooping !== false,
    frameRate: validTiming ? frameRate : null,
    sourceFirstFrame: validTiming ? sourceFirstFrame : null,
    sourceLastFrame: validTiming ? sourceLastFrame : null,
  };
}

function decodedAnimationTakes(subAssets: readonly AssetSubAsset[]): ModelAnimationClipSource[] {
  const model = subAssets.find((subAsset) => subAsset.kind === "model" && subAsset.localId === "main");
  const takes = Array.isArray(model?.animationTakes) ? model.animationTakes : [];
  return takes.flatMap((candidate) => {
    const take = record(candidate);
    const localId = typeof take?.localId === "string" ? take.localId.trim() : "";
    const name = typeof take?.name === "string" ? take.name.trim() : "";
    const sourceIndex = nonNegativeInteger(take?.sourceIndex);
    if (!localId || !name || sourceIndex === null) return [];
    const frameRate = finite(take?.frameRate);
    const firstFrame = finite(take?.firstFrame);
    const lastFrame = finite(take?.lastFrame);
    const validTiming = frameRate !== null && frameRate > 0
      && firstFrame !== null && lastFrame !== null && lastFrame > firstFrame;
    return [{
      localId,
      name,
      origin: "source" as const,
      sourceName: name,
      sourceIndex,
      sourceTakeLocalId: localId,
      runtimeClipIndex: sourceIndex,
      sourceLooping: take?.looping !== false,
      frameRate: validTiming ? frameRate : null,
      sourceFirstFrame: validTiming ? firstFrame : null,
      sourceLastFrame: validTiming ? lastFrame : null,
    }];
  });
}

/** Source takes remain available even when every imported Clip segment is removed. */
export function modelAnimationTakeSources(
  subAssets: readonly AssetSubAsset[],
): ModelAnimationClipSource[] {
  const takes = decodedAnimationTakes(subAssets);
  if (takes.length > 0) return takes;
  return subAssets.flatMap((subAsset) => {
    const decoded = decodedClipSource(subAsset);
    return decoded?.origin === "source" ? [decoded] : [];
  });
}

/** Decodes importer-owned source facts before the Animation Inspector consumes them. */
export function modelAnimationClipSources(
  subAssets: readonly AssetSubAsset[],
  settings?: Pick<ModelImportSettings, "clipSettings">,
): ModelAnimationClipSource[] {
  const catalog = subAssets.flatMap((subAsset) => {
    const decoded = decodedClipSource(subAsset);
    return decoded ? [decoded] : [];
  });
  if (!settings) return catalog;
  const sourceTakes = modelAnimationTakeSources(subAssets);
  const takeByIndex = new Map(sourceTakes.map((take) => [take.sourceIndex, take]));
  const catalogLocalIds = new Set(catalog.map((clip) => clip.localId));
  const visibleCatalog = catalog.filter((clip) => settings.clipSettings[clip.localId]?.enabled !== false);
  const added = Object.entries(settings.clipSettings).flatMap(([localId, configured]) => {
    if (catalogLocalIds.has(localId) || configured.kind !== "segment" || configured.enabled === false) return [];
    const take = configured.sourceIndex === undefined ? null : takeByIndex.get(configured.sourceIndex);
    if (!take || (configured.sourceTakeLocalId && configured.sourceTakeLocalId !== take.localId)) return [];
    return [{
      ...take,
      localId,
      name: configured.name || take.sourceName,
      origin: "segment" as const,
      sourceTakeLocalId: take.localId,
      runtimeClipIndex: null,
    }];
  }).sort((left, right) => left.localId.localeCompare(right.localId));
  return [...visibleCatalog, ...added];
}

/** Resolves draft settings over immutable source take facts. */
export function modelAnimationClipSettings(
  settings: Pick<ModelImportSettings, "clipSettings">,
  source: ModelAnimationClipSource,
): ResolvedModelAnimationClipSettings {
  const configured = settings.clipSettings[source.localId];
  const ownsSourceTake = configured?.sourceIndex === source.sourceIndex;
  const configuredFirst = finite(configured?.firstFrame);
  const configuredLast = finite(configured?.lastFrame);
  const hasConfiguredRange = ownsSourceTake
    && configuredFirst !== null
    && configuredLast !== null
    && configuredLast > configuredFirst;
  return {
    name: ownsSourceTake && configured?.name ? configured.name : source.sourceName,
    looping: configured?.looping ?? source.sourceLooping,
    loopPose: configured?.loopPose === true,
    firstFrame: hasConfiguredRange ? configuredFirst : source.sourceFirstFrame,
    lastFrame: hasConfiguredRange ? configuredLast : source.sourceLastFrame,
  };
}

type ClipSettingChanges = Readonly<{
  name?: string;
  looping?: boolean;
  loopPose?: boolean;
  firstFrame?: number;
  lastFrame?: number;
}>;

/** Builds one complete, runtime-addressable clip setting without mutating the draft. */
export function setModelAnimationClipSettings(
  settings: Pick<ModelImportSettings, "clipSettings">,
  source: ModelAnimationClipSource,
  changes: ClipSettingChanges,
): Pick<ModelImportSettings, "clipSettings"> {
  const current = modelAnimationClipSettings(settings, source);
  const sourceFirst = source.sourceFirstFrame;
  const sourceLast = source.sourceLastFrame;
  const requestedFirst = finite(changes.firstFrame) ?? current.firstFrame;
  const requestedLast = finite(changes.lastFrame) ?? current.lastFrame;
  const hasSourceTiming = sourceFirst !== null && sourceLast !== null;
  const frameSpan = hasSourceTiming ? Math.min(1, sourceLast - sourceFirst) : 0;
  const firstFrame = hasSourceTiming && requestedFirst !== null && requestedLast !== null
    ? Math.min(sourceLast - frameSpan, Math.max(sourceFirst, requestedFirst))
    : null;
  const lastFrame = hasSourceTiming && requestedLast !== null && firstFrame !== null
    ? Math.min(sourceLast, Math.max(firstFrame + frameSpan, requestedLast))
    : null;
  const authoredName = settings.clipSettings[source.localId]?.name;
  const authoredEvents = settings.clipSettings[source.localId]?.events;
  const authoredLoopPose = settings.clipSettings[source.localId]?.loopPose;
  const requestedName = changes.name === undefined ? authoredName : changes.name;
  const name = requestedName?.trim().slice(0, 120);
  const next: ModelAnimationClipSettings = {
    kind: source.origin,
    enabled: true,
    sourceIndex: source.sourceIndex,
    sourceTakeLocalId: source.sourceTakeLocalId,
    looping: changes.looping ?? current.looping,
    ...((changes.loopPose ?? authoredLoopPose) === true ? { loopPose: true } : {}),
    ...(firstFrame !== null && lastFrame !== null ? { firstFrame, lastFrame } : {}),
    ...(name && name !== source.sourceName ? { name } : {}),
    ...(authoredEvents === undefined ? {} : { events: authoredEvents }),
  };
  return {
    clipSettings: {
      ...settings.clipSettings,
      [source.localId]: next,
    },
  };
}

/** Adds another stable Clip subasset segment sourced from the selected FBX take. */
export function addModelAnimationClipSettings(
  settings: Pick<ModelImportSettings, "clipSettings">,
  source: ModelAnimationClipSource,
  localId: string,
  name: string,
): Pick<ModelImportSettings, "clipSettings"> {
  if (!localId.startsWith("clip:") || settings.clipSettings[localId]) {
    return { clipSettings: settings.clipSettings };
  }
  const firstFrame = source.sourceFirstFrame;
  const lastFrame = source.sourceLastFrame;
  return {
    clipSettings: {
      ...settings.clipSettings,
      [localId]: {
        kind: "segment",
        enabled: true,
        sourceIndex: source.sourceIndex,
        sourceTakeLocalId: source.sourceTakeLocalId,
        name: name.trim().slice(0, 120) || `${source.sourceName} Copy`,
        looping: source.sourceLooping,
        ...(firstFrame !== null && lastFrame !== null ? { firstFrame, lastFrame } : {}),
      },
    },
  };
}

/** Removes a clip as a stable tombstone so its old AssetRefs cannot bind to a future clip. */
export function removeModelAnimationClipSettings(
  settings: Pick<ModelImportSettings, "clipSettings">,
  source: ModelAnimationClipSource,
): Pick<ModelImportSettings, "clipSettings"> {
  const authored = setModelAnimationClipSettings(settings, source, {}).clipSettings[source.localId]!;
  return {
    clipSettings: {
      ...settings.clipSettings,
      [source.localId]: { ...authored, enabled: false },
    },
  };
}

/** Narrow resolver for consumers that only have catalog loop metadata. */
export function modelAnimationClipLooping(
  settings: Pick<ModelImportSettings, "clipSettings">,
  localId: string,
  sourceLooping: boolean,
): boolean {
  return settings.clipSettings[localId]?.looping ?? sourceLooping;
}

/** Preserves the legacy loop-only authoring boundary for existing callers. */
export function setModelAnimationClipLooping(
  settings: Pick<ModelImportSettings, "clipSettings">,
  localId: string,
  looping: boolean,
): Pick<ModelImportSettings, "clipSettings"> {
  if (!localId.trim()) return { clipSettings: settings.clipSettings };
  return {
    clipSettings: {
      ...settings.clipSettings,
      [localId]: { ...settings.clipSettings[localId], looping },
    },
  };
}
