import {
  DEFAULT_RIG_IMPORT_SETTINGS,
  type RigImportSettings,
} from "../character/domain/rig";
import { decodeRigImportSettings } from "../character/serialization/rig-import-settings-codec";

export type MeshCompressionMode = "off" | "low" | "medium" | "high";
export type OptimizeMeshMode = "none" | "polygonOrder";
export type SourceUnit = "centimeter" | "meter";
export type NormalImportMode = "import" | "calculate";
export type NormalCalculationMode = "unweighted" | "areaWeighted" | "angleWeighted" | "areaAndAngleWeighted";
export type SmoothnessSource = "fromAngle" | "none";
export type MaterialImportMode = "preserve" | "import";
export type AnimationCompressionMode = "off" | "keyframeReduction";

export type ModelAnimationEventPayloadValue = string | number | boolean | null;
export type ModelAnimationEventSettings = {
  id: string;
  name: string;
  timeSeconds: number;
  payload: Record<string, ModelAnimationEventPayloadValue>;
};

export type ModelAnimationClipSettings = {
  /** Source clips replace an imported take; segments create another clip from it. */
  kind?: "source" | "segment";
  /** Disabled entries are stable tombstones and do not publish Clip subassets. */
  enabled?: boolean;
  /** Source take slot. Stable local ID remains the authored identity. */
  sourceIndex?: number;
  /** Stable source-take identity used by authoring and catalog reconciliation. */
  sourceTakeLocalId?: string;
  /** Optional imported clip display name; changing it never changes local ID. */
  name?: string;
  /** Inclusive source frame range, matching Unity's ModelImporter clip contract. */
  firstFrame?: number;
  lastFrame?: number;
  /** Whether the imported clip repeats after reaching its duration. */
  looping: boolean;
  /** Distributes transform endpoint differences so a repeated pose has no seam. */
  loopPose?: boolean;
  /** Importer-authored event markers on this clip's local timeline. */
  events?: ModelAnimationEventSettings[];
};

export type ModelImportSettings = {
  scaleFactor: number;
  fitToEditorSize: boolean;
  convertUnits: boolean;
  sourceUnit: SourceUnit;
  bakeAxisConversion: boolean;
  /** Character semantics and skinning policy. Legacy blend-shape settings migrate here. */
  rig: RigImportSettings;
  importVisibility: boolean;
  importCameras: boolean;
  importLights: boolean;
  preserveHierarchy: boolean;
  sortHierarchyByName: boolean;
  meshCompression: MeshCompressionMode;
  readWrite: boolean;
  optimizeMesh: OptimizeMeshMode;
  generateColliders: boolean;
  normals: NormalImportMode;
  normalCalculationMode: NormalCalculationMode;
  smoothnessSource: SmoothnessSource;
  smoothingAngle: number;
  importMaterials: boolean;
  materialMode: MaterialImportMode;
  importAnimations: boolean;
  /** Stable clip-local-ID keyed overrides; names and source indexes are not identity. */
  clipSettings: Record<string, ModelAnimationClipSettings>;
  /** @deprecated Retained for v1 import-document compatibility; source loaders own interpolation sampling. */
  resampleCurves: boolean;
  animationCompression: AnimationCompressionMode;
};

export const defaultModelImportSettings: ModelImportSettings = {
  scaleFactor: 1,
  fitToEditorSize: true,
  convertUnits: true,
  sourceUnit: "centimeter",
  bakeAxisConversion: false,
  rig: DEFAULT_RIG_IMPORT_SETTINGS,
  importVisibility: true,
  importCameras: false,
  importLights: false,
  preserveHierarchy: true,
  sortHierarchyByName: true,
  meshCompression: "off",
  readWrite: false,
  optimizeMesh: "polygonOrder",
  generateColliders: false,
  normals: "import",
  normalCalculationMode: "areaAndAngleWeighted",
  smoothnessSource: "fromAngle",
  smoothingAngle: 60,
  importMaterials: true,
  materialMode: "preserve",
  importAnimations: true,
  clipSettings: {},
  resampleCurves: true,
  animationCompression: "off",
};

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function option<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

const MAX_CLIP_SETTINGS = 1_024;
const MAX_CLIP_SOURCE_INDEX = 1_023;
const MAX_CLIP_FRAME = 1_000_000;
const MAX_CLIP_NAME_LENGTH = 120;
const MAX_CLIP_LOCAL_ID_LENGTH = 240;
export const MAX_MODEL_ANIMATION_EVENTS = 256;
export const MAX_MODEL_ANIMATION_EVENT_PAYLOAD_ENTRIES = 32;
const MAX_ANIMATION_EVENT_ID_LENGTH = 240;
const MAX_ANIMATION_EVENT_NAME_LENGTH = 120;
const MAX_ANIMATION_EVENT_PAYLOAD_KEY_LENGTH = 120;
const MAX_ANIMATION_EVENT_PAYLOAD_TEXT_LENGTH = 4_096;

function normalizeAnimationEventPayload(value: unknown): ModelAnimationEventSettings["payload"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .flatMap(([rawKey, item]): Array<[string, ModelAnimationEventPayloadValue]> => {
      const key = rawKey.trim().slice(0, MAX_ANIMATION_EVENT_PAYLOAD_KEY_LENGTH);
      if (!key) return [];
      if (item === null || typeof item === "boolean") return [[key, item]];
      if (typeof item === "number" && Number.isFinite(item)) return [[key, item]];
      if (typeof item === "string") {
        return [[key, item.slice(0, MAX_ANIMATION_EVENT_PAYLOAD_TEXT_LENGTH)]];
      }
      return [];
    })
    .slice(0, MAX_MODEL_ANIMATION_EVENT_PAYLOAD_ENTRIES));
}

export function normalizeModelAnimationEvents(value: unknown): ModelAnimationEventSettings[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((rawEvent): ModelAnimationEventSettings[] => {
    if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) return [];
    const input = rawEvent as Record<string, unknown>;
    const id = typeof input.id === "string"
      ? input.id.trim().slice(0, MAX_ANIMATION_EVENT_ID_LENGTH)
      : "";
    const name = typeof input.name === "string"
      ? input.name.trim().slice(0, MAX_ANIMATION_EVENT_NAME_LENGTH)
      : "";
    const timeSeconds = typeof input.timeSeconds === "number" && Number.isFinite(input.timeSeconds)
      ? Math.max(0, input.timeSeconds)
      : Number.NaN;
    if (!id || seen.has(id) || !name || !Number.isFinite(timeSeconds)) return [];
    seen.add(id);
    return [{ id, name, timeSeconds, payload: normalizeAnimationEventPayload(input.payload) }];
  }).sort((left, right) => left.timeSeconds - right.timeSeconds)
    .slice(0, MAX_MODEL_ANIMATION_EVENTS);
}

function normalizeClipSettings(value: unknown): Record<string, ModelAnimationClipSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const settings = Object.entries(value as Record<string, unknown>)
    .flatMap(([rawLocalId, rawSettings]): Array<[string, ModelAnimationClipSettings]> => {
      const localId = rawLocalId.trim();
      if (!localId || !rawSettings || typeof rawSettings !== "object" || Array.isArray(rawSettings)) {
        return [];
      }
      const input = rawSettings as Record<string, unknown>;
      const looping = input.looping;
      if (typeof looping !== "boolean") return [];
      const sourceIndex = typeof input.sourceIndex === "number" ? input.sourceIndex : Number.NaN;
      const firstFrame = typeof input.firstFrame === "number" ? input.firstFrame : Number.NaN;
      const lastFrame = typeof input.lastFrame === "number" ? input.lastFrame : Number.NaN;
      const hasValidSourceIndex = Number.isInteger(sourceIndex)
        && sourceIndex >= 0
        && sourceIndex <= MAX_CLIP_SOURCE_INDEX;
      const hasValidRange = hasValidSourceIndex
        && Number.isFinite(firstFrame)
        && firstFrame >= 0
        && firstFrame <= MAX_CLIP_FRAME
        && Number.isFinite(lastFrame)
        && lastFrame > firstFrame
        && lastFrame <= MAX_CLIP_FRAME;
      const name = typeof input.name === "string"
        ? input.name.trim().slice(0, MAX_CLIP_NAME_LENGTH)
        : "";
      const sourceTakeLocalId = typeof input.sourceTakeLocalId === "string"
        ? input.sourceTakeLocalId.trim().slice(0, MAX_CLIP_LOCAL_ID_LENGTH)
        : "";
      const kind = input.kind === "source" || input.kind === "segment" ? input.kind : undefined;
      const hasEvents = Array.isArray(input.events);
      return [[localId, {
        looping,
        ...(typeof input.loopPose === "boolean" ? { loopPose: input.loopPose } : {}),
        ...(kind ? { kind } : {}),
        ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
        ...(hasValidSourceIndex ? { sourceIndex } : {}),
        ...(hasValidSourceIndex && sourceTakeLocalId ? { sourceTakeLocalId } : {}),
        ...(hasValidRange ? { firstFrame, lastFrame } : {}),
        ...(name ? { name } : {}),
        ...(hasEvents ? { events: normalizeModelAnimationEvents(input.events) } : {}),
      }]];
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_CLIP_SETTINGS);
  return Object.fromEntries(settings);
}

export function normalizeModelImportSettings(value: unknown): ModelImportSettings {
  const raw = value && typeof value === "object" ? value as Partial<ModelImportSettings> : {};
  const legacy = raw as Partial<ModelImportSettings> & {
    importBlendShapes?: unknown;
    animationType?: unknown;
    rigType?: unknown;
    rootBone?: unknown;
  };
  const rigSource = raw.rig ?? {
    kind: legacy.rigType ?? legacy.animationType ?? "none",
    importBlendShapes: legacy.importBlendShapes,
    rootBoneId: legacy.rootBone,
  };
  return {
    scaleFactor: Math.max(0.0001, finiteNumber(raw.scaleFactor, defaultModelImportSettings.scaleFactor)),
    fitToEditorSize: raw.fitToEditorSize !== false,
    convertUnits: raw.convertUnits !== false,
    sourceUnit: option(raw.sourceUnit, ["centimeter", "meter"], defaultModelImportSettings.sourceUnit),
    bakeAxisConversion: raw.bakeAxisConversion === true,
    rig: decodeRigImportSettings(rigSource),
    importVisibility: raw.importVisibility !== false,
    importCameras: raw.importCameras === true,
    importLights: raw.importLights === true,
    preserveHierarchy: raw.preserveHierarchy !== false,
    sortHierarchyByName: raw.sortHierarchyByName !== false,
    meshCompression: option(raw.meshCompression, ["off", "low", "medium", "high"], defaultModelImportSettings.meshCompression),
    readWrite: raw.readWrite === true,
    optimizeMesh: option(raw.optimizeMesh, ["none", "polygonOrder"], defaultModelImportSettings.optimizeMesh),
    generateColliders: raw.generateColliders === true,
    normals: option(raw.normals, ["import", "calculate"], defaultModelImportSettings.normals),
    normalCalculationMode: option(
      raw.normalCalculationMode,
      ["unweighted", "areaWeighted", "angleWeighted", "areaAndAngleWeighted"],
      defaultModelImportSettings.normalCalculationMode,
    ),
    smoothnessSource: option(raw.smoothnessSource, ["fromAngle", "none"], defaultModelImportSettings.smoothnessSource),
    smoothingAngle: Math.max(0, Math.min(180, finiteNumber(raw.smoothingAngle, defaultModelImportSettings.smoothingAngle))),
    importMaterials: raw.importMaterials !== false,
    materialMode: option(raw.materialMode, ["preserve", "import"], defaultModelImportSettings.materialMode),
    importAnimations: raw.importAnimations !== false,
    clipSettings: normalizeClipSettings(raw.clipSettings),
    resampleCurves: raw.resampleCurves !== false,
    animationCompression: option(
      raw.animationCompression,
      ["off", "keyframeReduction"],
      defaultModelImportSettings.animationCompression,
    ),
  };
}

/** Produces a deeply immutable runtime snapshot from untrusted importer settings. */
export function normalizeImmutableModelImportSettings(value: unknown): ModelImportSettings {
  return freezeSnapshot(normalizeModelImportSettings(value));
}

function freezeSnapshot<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeSnapshot(nested);
  return Object.freeze(value);
}

export function versionedModelAssetUrl(url: string, version: string): string {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const resource = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = resource.indexOf("?");
  const base = queryIndex >= 0 ? resource.slice(0, queryIndex) : resource;
  const params = new URLSearchParams(queryIndex >= 0 ? resource.slice(queryIndex + 1) : "");
  params.set("importVersion", version);
  return `${base}?${params.toString()}${fragment}`;
}

const ANIMATION_SOURCE_PREVIEW_PARAM = "animationSourcePreview";

/** Requests immutable source takes for importer-owned draft clip previews. */
export function modelAnimationSourcePreviewUrl(url: string): string {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const resource = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = resource.indexOf("?");
  const base = queryIndex >= 0 ? resource.slice(0, queryIndex) : resource;
  const params = new URLSearchParams(queryIndex >= 0 ? resource.slice(queryIndex + 1) : "");
  params.set(ANIMATION_SOURCE_PREVIEW_PARAM, "1");
  return `${base}?${params.toString()}${fragment}`;
}

export function isModelAnimationSourcePreviewUrl(url: string): boolean {
  try {
    return new URL(url, globalThis.location?.href ?? "http://localhost/")
      .searchParams.get(ANIMATION_SOURCE_PREVIEW_PARAM) === "1";
  } catch {
    return false;
  }
}
