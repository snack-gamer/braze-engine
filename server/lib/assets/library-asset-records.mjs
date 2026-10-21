import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { safeName } from "../encoding.mjs";
import { ensureAssetMeta } from "../asset-index.mjs";
import { refreshAssetDatabase } from "./asset-database-store.mjs";
import { normalizeRigSettings } from "../model-import-settings.mjs";
import { effectiveAssetContentRevision } from "./asset-content-revision.mjs";
import { configuredAnimationClipRecords } from "./configured-animation-clip-record.mjs";
import {
  ASSETS_ROOT,
  projectAssetPath,
  projectAssetUrl,
} from "../paths.mjs";

export const INPUT_ACTION_MAP_EXT = /\.braze-input\.json$/i;
export const MODEL_EXT = /\.(glb|gltf|fbx|usdz|usd)$/i;
export const FONT_EXT = /\.(woff2?|ttf|otf)$/i;
export const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
export const PREFAB_CANONICAL_EXT = ".braze-prefab.json";
export const PREFAB_LEGACY_EXT = ".tganprefab.json";
export const PREFAB_EXT = /\.(?:braze-prefab|tganprefab)\.json$/i;

function assetKind(filename) {
  if (INPUT_ACTION_MAP_EXT.test(filename)) return "inputActionMap";
  if (PREFAB_EXT.test(filename)) return "prefab";
  if (FONT_EXT.test(filename)) return "font";
  if (IMAGE_EXT.test(filename)) return "image";
  return "model";
}

export function assetExt(filename) {
  const lower = filename.toLowerCase();
  if (INPUT_ACTION_MAP_EXT.test(filename)) return ".braze-input.json";
  if (lower.endsWith(PREFAB_CANONICAL_EXT)) return PREFAB_CANONICAL_EXT;
  if (lower.endsWith(PREFAB_LEGACY_EXT)) return PREFAB_LEGACY_EXT;
  return path.extname(filename).toLowerCase() || ".bin";
}

export function assetStem(filename, extension = assetExt(filename)) {
  const base = path.basename(filename);
  const stem = base.toLowerCase().endsWith(extension.toLowerCase())
    ? base.slice(0, -extension.length)
    : base;
  return safeName(stem);
}

function describeAsset(filename) {
  const absolute = path.join(ASSETS_ROOT, filename);
  if (!existsSync(absolute)) return null;
  const stats = statSync(absolute);
  if (!stats.isFile()) return null;
  return {
    filename,
    name: path.basename(filename),
    kind: assetKind(filename),
    path: `assets/${projectAssetPath(absolute)}`,
    url: projectAssetUrl(filename),
    sizeBytes: stats.size,
    updatedAt: stats.mtime.toISOString(),
  };
}

export async function describeIndexedAsset(filename, contentRevision) {
  const asset = describeAsset(filename);
  if (!asset) return null;
  const { meta } = await ensureAssetMeta(path.join(ASSETS_ROOT, filename));
  return {
    ...asset,
    guid: meta.guid,
    importerId: meta.importer.id,
    status: "ready",
    ...(typeof contentRevision === "string" ? { contentRevision } : {}),
  };
}

export function enrichLibraryAsset(asset, record) {
  const contentRevision = effectiveAssetContentRevision(record);
  const subAssets = configuredSubAssets(record.subAssets, record.importSettings);
  return {
    ...asset,
    guid: record.guid,
    importerId: record.importerId,
    status: record.status,
    foreignIds: record.foreignIds ?? {},
    dependencies: record.dependencies ?? [],
    subAssets,
    diagnostics: configuredCharacterDiagnostics(
      record.diagnostics,
      subAssets,
      record.importSettings,
    ),
    ...(typeof contentRevision === "string"
      ? { contentRevision }
      : {}),
  };
}

/** Adds settings-dependent character diagnostics without changing source analysis. */
export function configuredCharacterDiagnostics(diagnostics, subAssets, importSettings) {
  const entries = Array.isArray(diagnostics) ? diagnostics : [];
  const rawRig = importSettings?.rig;
  if (!rawRig || typeof rawRig !== "object" || Array.isArray(rawRig)) return entries;
  const rig = normalizeRigSettings(rawRig);
  const detectedSkin = Array.isArray(subAssets)
    && subAssets.some((entry) => entry?.kind === "avatar");
  if (
    rig.kind !== "none"
    || !detectedSkin
    || entries.some((entry) => entry?.code === "skinned-content-without-rig")
  ) return entries;
  return [...entries, {
    code: "skinned-content-without-rig",
    severity: "warning",
    message: "This model contains skinning, but its Animation Type is None.",
  }];
}

/** Merges persisted Avatar intent into importer-derived skeleton facts. */
export function configuredSubAssets(subAssets, importSettings) {
  const entries = Array.isArray(subAssets) ? subAssets : [];
  const rawRig = importSettings?.rig;
  const rig = rawRig && typeof rawRig === "object" && !Array.isArray(rawRig)
    ? normalizeRigSettings(rawRig)
    : null;
  const clipSettings = importSettings?.clipSettings
    && typeof importSettings.clipSettings === "object"
    && !Array.isArray(importSettings.clipSettings)
    ? importSettings.clipSettings
    : {};
  const hasClipConfiguration = Boolean(importSettings)
    && (Object.hasOwn(importSettings, "importAnimations") || Object.keys(clipSettings).length > 0);
  if (!rig && !hasClipConfiguration) return entries;
  const sourceClips = entries.filter((entry) => entry?.kind === "clip");
  const configuredClips = hasClipConfiguration
    ? configuredAnimationClipRecords(
        sourceClips,
        clipSettings,
        importSettings?.importAnimations !== false,
      )
    : sourceClips;
  let insertedClips = false;
  return entries.flatMap((entry) => {
    if (entry?.kind === "clip") {
      if (insertedClips) return [];
      insertedClips = true;
      return configuredClips;
    }
    if (entry?.kind !== "avatar") return entry;
    if (!rig) return entry;
    const shared = {
      ...entry,
      configuredRigKind: rig.kind,
      inspectorValues: {
        ...entry.inspectorValues,
        "Animation Type": rig.kind[0].toUpperCase() + rig.kind.slice(1),
        ...(rig.rootBoneId ? { "Root Bone": configuredBoneName(entry, rig.rootBoneId) } : {}),
        ...(rig.motionRootBoneId ? { "Motion Root": configuredBoneName(entry, rig.motionRootBoneId) } : {}),
      },
      ...(rig.kind !== "none" && rig.rootBoneId
        ? { configuredRootBoneId: rig.rootBoneId }
        : {}),
      ...(rig.kind !== "none" && rig.motionRootBoneId
        ? { configuredMotionRootBoneId: rig.motionRootBoneId }
        : {}),
    };
    if (rig.kind !== "humanoid") return shared;
    return {
      ...shared,
      configuredAvatarSource: rig.avatarSource.kind,
      ...(rig.avatarSource.kind === "copyFromAvatar"
        ? { configuredAvatarRef: rig.avatarSource.avatarRef }
        : {}),
      humanBoneMapping: rig.humanBoneMapping,
      humanoidTuning: rig.humanoidTuning,
      inspectorValues: {
        ...shared.inspectorValues,
        Definition: rig.avatarSource.kind === "copyFromAvatar"
          ? "Copy From Other Avatar" : "Create From This Model",
        "Human Mapping": countLabel(Object.keys(rig.humanBoneMapping).length, "bone"),
      },
    };
  });
}

function configuredBoneName(entry, localId) {
  return (Array.isArray(entry.bones)
    ? entry.bones.find((bone) => bone?.localId === localId)?.name
    : null) ?? "None";
}

function countLabel(count, singular) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function shouldListAsset(filename) {
  const absolute = path.join(ASSETS_ROOT, filename);
  if (!existsSync(absolute)) return false;
  const stats = statSync(absolute);
  if (!stats.isFile()) return false;
  return true;
}

export async function listAssets() {
  await mkdir(ASSETS_ROOT, { recursive: true });
  const index = await refreshAssetDatabase();
  return index.records
    .filter(
      (record) =>
        shouldListAsset(record.sourcePath)
        && (MODEL_EXT.test(record.sourcePath)
          || IMAGE_EXT.test(record.sourcePath) || FONT_EXT.test(record.sourcePath)
          || PREFAB_EXT.test(record.sourcePath)
          || INPUT_ACTION_MAP_EXT.test(record.sourcePath)),
    )
    .map((record) => {
      const asset = describeAsset(record.sourcePath);
      return asset ? enrichLibraryAsset(asset, record) : null;
    })
    .filter((asset) => asset !== null)
    .sort((left, right) => left.filename.localeCompare(right.filename));
}

export function copyFilename(filename) {
  const extension = assetExt(filename);
  const stem = assetStem(filename, extension);
  const directory = path.dirname(filename) === "." ? "" : path.dirname(filename);
  let candidate = directory
    ? `${directory}/${stem}-copy${extension}`
    : `${stem}-copy${extension}`;
  let index = 2;
  while (existsSync(path.join(ASSETS_ROOT, candidate))) {
    candidate = directory
      ? `${directory}/${stem}-copy-${index}${extension}`
      : `${stem}-copy-${index}${extension}`;
    index += 1;
  }
  return candidate;
}

export function availableFilename(filename) {
  if (!existsSync(path.join(ASSETS_ROOT, filename))) return filename;
  const extension = assetExt(filename);
  const base = path.basename(filename);
  const stem = base.toLowerCase().endsWith(extension.toLowerCase())
    ? base.slice(0, -extension.length)
    : base;
  const directory = path.dirname(filename) === "." ? "" : path.dirname(filename);
  let index = 1;
  let candidate;
  do {
    const nextBase = `${stem} ${index}${extension}`;
    candidate = directory ? `${directory}/${nextBase}` : nextBase;
    index += 1;
  } while (existsSync(path.join(ASSETS_ROOT, candidate)));
  return candidate;
}
