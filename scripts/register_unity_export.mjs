#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertUnityPrefabIdentity,
  manifestUnityPrefabGuid,
  verifyExportGlbHash,
} from "./lib/unity-export-registration.mjs";

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.BRAZE_ENGINE_ROOT ||= ENGINE_ROOT;

const {
  ensureAssetMeta,
  metaPathForSource,
  scanAssetIndex,
  updateAssetMeta,
} = await import("../server/lib/asset-index.mjs");
const { ASSETS_ROOT, projectAssetPath, projectAssetUrl } = await import("../server/lib/paths.mjs");

const DEFAULT_OBJECT_COLOR = "#9da3a6";

function usage() {
  return [
    "Usage:",
    "  npm run unity:register -- --manifest /absolute/path/to/shop.braze-export.json [--name 'Shop']",
    "",
    "The manifest and its self-contained GLB must already be inside the open Braze project's assets folder.",
  ].join("\n");
}

function argumentsFrom(argv) {
  const output = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const equals = item.indexOf("=");
    if (equals > 0) {
      output.set(item.slice(2, equals), item.slice(equals + 1));
    } else {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        output.set(item.slice(2), value);
        index += 1;
      } else {
        output.set(item.slice(2), "true");
      }
    }
  }
  return output;
}

function required(args, key) {
  const value = args.get(key);
  if (!value) throw new Error(`Missing --${key}\n\n${usage()}`);
  return value;
}

function insideAssets(filename) {
  const absolute = path.resolve(filename);
  const relative = path.relative(ASSETS_ROOT, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Export must stay inside the project assets folder: ${ASSETS_ROOT}`);
  }
  return absolute;
}

function cleanName(value, fallback) {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function slug(value) {
  return String(value || "asset")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function vec3(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const parsed = value.slice(0, 3).map(Number);
  return parsed.every(Number.isFinite) ? parsed : [...fallback];
}

function positiveSize(value, fallback) {
  return vec3(value, fallback).map((item, index) => (
    Number.isFinite(item) && Math.abs(item) >= 0.001 ? Math.abs(item) : fallback[index]
  ));
}

function colliderFromManifest(manifest, objectId) {
  const source = Array.isArray(manifest.colliders)
    ? manifest.colliders.find((item) => item?.enabled !== false && item?.isTrigger !== true && item?.bounds)
    : null;
  const bounds = source?.bounds ?? manifest.bounds ?? {};
  const size = positiveSize(bounds.size, [1, 1, 1]);
  const center = vec3(bounds.center, [0, size[1] * 0.5, 0]);
  return {
    id: `${objectId}-collider-1`,
    enabled: true,
    shape: "box",
    center,
    size,
    radius: Math.max(...size) * 0.5,
    length: Math.max(0.001, size[1] - Math.max(size[0], size[2])),
    majorRadius: Math.max(size[0], size[2]) * 0.5,
    minorRadius: Math.max(0.001, Math.min(size[0], size[2]) * 0.12),
    friction: 0.5,
    showGizmo: false,
  };
}

function modelSettings(manifest) {
  const suggested = manifest.recommendedBrazeModelSettings && typeof manifest.recommendedBrazeModelSettings === "object"
    ? manifest.recommendedBrazeModelSettings
    : {};
  return {
    scaleFactor: Number.isFinite(Number(suggested.scaleFactor)) ? Math.max(0.0001, Number(suggested.scaleFactor)) : 1,
    fitToEditorSize: false,
    convertUnits: suggested.convertUnits !== false,
    sourceUnit: "meter",
    bakeAxisConversion: false,
    importCameras: false,
    importLights: false,
    preserveHierarchy: true,
    sortHierarchyByName: false,
    generateColliders: false,
    importMaterials: suggested.importMaterials !== false,
    materialMode: "preserve",
    importAnimations: suggested.importAnimations === true,
  };
}

function unityForeignIds(manifest, sourceUnityGuid) {
  const source = manifest.source && typeof manifest.source === "object" ? manifest.source : {};
  const output = {};
  output.unityPrefabGuid = sourceUnityGuid;
  if (source.unityFileId !== undefined) output.unityPrefabFileId = String(source.unityFileId);
  if (source.assetPath) output.unityPrefabAssetPath = String(source.assetPath);
  return output;
}

async function readExistingJson(filename) {
  if (!existsSync(filename)) return null;
  return JSON.parse(await readFile(filename, "utf8"));
}

async function writeJsonAtomic(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

function newPrefabDocument({ name, stem, modelRecord, modelRelativePath, manifest, manifestRelativePath }) {
  const rootId = `${stem}-root`;
  const modelId = `${stem}-model`;
  return {
    version: "braze/prefab-v1",
    name,
    createdAt: new Date().toISOString(),
    rootIds: [rootId],
    objects: [
      {
        id: rootId,
        name,
        primitive: "transform",
        color: DEFAULT_OBJECT_COLOR,
        visible: true,
        locked: false,
        transformLocked: false,
        renderVisible: false,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        id: modelId,
        name: `${name} Model`,
        primitive: "gltf",
        parentId: rootId,
        color: DEFAULT_OBJECT_COLOR,
        visible: true,
        locked: false,
        transformLocked: false,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        assetName: path.basename(modelRelativePath),
        assetRef: { guid: modelRecord.guid, localId: "main" },
        assetUrl: projectAssetUrl(modelRelativePath),
        assetNote: `Unity static prefab export · ${manifest.source?.assetPath || manifestRelativePath}`,
        meshRenderer: { enabled: true, castShadows: true, receiveShadows: true },
        colliders: [colliderFromManifest(manifest, modelId)],
      },
    ],
    brazeImport: {
      kind: "unity-static-prefab",
      manifest: manifestRelativePath,
      sourceUnityGuid: String(manifest.source?.unityGuid || ""),
    },
  };
}

function refreshExistingPrefab(document, modelRecord, modelRelativePath) {
  if (!document || !Array.isArray(document.objects)) {
    throw new Error("Existing prefab is not a valid Braze prefab document");
  }
  let changed = false;
  const objects = document.objects.map((object) => {
    if (!object || object.primitive !== "gltf") return object;
    const referencesModel = object.assetRef?.guid === modelRecord.guid || object.assetUrl === projectAssetUrl(modelRelativePath);
    if (!referencesModel) return object;
    const next = {
      ...object,
      assetRef: { guid: modelRecord.guid, localId: object.assetRef?.localId || "main" },
      assetUrl: projectAssetUrl(modelRelativePath),
      assetName: path.basename(modelRelativePath),
    };
    changed = JSON.stringify(next) !== JSON.stringify(object) || changed;
    return next;
  });
  return changed ? { ...document, savedAt: new Date().toISOString(), objects } : document;
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const manifestFilename = insideAssets(required(args, "manifest"));
  const manifest = JSON.parse(await readFile(manifestFilename, "utf8"));
  if (manifest?.kind !== "braze.unity-static-prefab-export" || manifest?.schemaVersion !== 1) {
    throw new Error("Unsupported Braze Unity export manifest");
  }
  const sourceUnityGuid = manifestUnityPrefabGuid(manifest);

  const glbName = String(manifest.output?.glb || "").trim();
  if (!glbName || path.basename(glbName) !== glbName) {
    throw new Error("Manifest output.glb must be a filename next to the manifest");
  }
  const glbFilename = insideAssets(path.join(path.dirname(manifestFilename), glbName));
  if (!existsSync(glbFilename)) throw new Error(`Exported GLB not found: ${glbFilename}`);
  await verifyExportGlbHash(glbFilename, manifest.output?.sha256);

  const modelRelativePath = projectAssetPath(glbFilename);
  const manifestRelativePath = projectAssetPath(manifestFilename);
  const displayName = cleanName(args.get("name"), cleanName(manifest.source?.name, path.parse(glbName).name));
  const stem = slug(path.parse(glbName).name);
  const prefabFilename = path.join(path.dirname(glbFilename), `${path.parse(glbName).name}.braze-prefab.json`);

  const existingModelMeta = await ensureAssetMeta(glbFilename);
  assertUnityPrefabIdentity(existingModelMeta.meta, sourceUnityGuid, `model '${modelRelativePath}'`);

  let existingPrefabMeta = null;
  if (existsSync(metaPathForSource(prefabFilename))) {
    existingPrefabMeta = await ensureAssetMeta(prefabFilename);
    assertUnityPrefabIdentity(
      existingPrefabMeta.meta,
      sourceUnityGuid,
      `prefab '${projectAssetPath(prefabFilename)}'`,
    );
  }

  await updateAssetMeta(glbFilename, {
    labels: [...new Set([...(existingModelMeta.meta.labels ?? []), "unity-export", "static-prefab"])],
    foreignIds: { ...existingModelMeta.meta.foreignIds, ...unityForeignIds(manifest, sourceUnityGuid) },
    importer: {
      id: "braze.model",
      settingsVersion: 1,
      settings: modelSettings(manifest),
    },
  });

  let database = await scanAssetIndex(ASSETS_ROOT);
  const modelRecord = database.records.find((record) => record.sourcePath === modelRelativePath);
  if (!modelRecord || modelRecord.status === "failed") {
    const detail = modelRecord?.diagnostics?.map((item) => item.message).join("; ") || "asset was not indexed";
    throw new Error(`Braze rejected the exported GLB: ${detail}`);
  }

  const existingPrefab = await readExistingJson(prefabFilename);
  const prefab = existingPrefab
    ? refreshExistingPrefab(existingPrefab, modelRecord, modelRelativePath)
    : newPrefabDocument({
        name: displayName,
        stem,
        modelRecord,
        modelRelativePath,
        manifest,
        manifestRelativePath,
      });
  await writeJsonAtomic(prefabFilename, prefab);

  existingPrefabMeta ??= await ensureAssetMeta(prefabFilename);
  await updateAssetMeta(prefabFilename, {
    labels: [...new Set([...(existingPrefabMeta.meta.labels ?? []), "unity-export", "prefab"])],
    foreignIds: { ...existingPrefabMeta.meta.foreignIds, ...unityForeignIds(manifest, sourceUnityGuid) },
  });

  database = await scanAssetIndex(ASSETS_ROOT);
  const prefabRelativePath = projectAssetPath(prefabFilename);
  const prefabRecord = database.records.find((record) => record.sourcePath === prefabRelativePath);
  if (!prefabRecord || prefabRecord.status === "failed") {
    const detail = prefabRecord?.diagnostics?.map((item) => item.message).join("; ") || "asset was not indexed";
    throw new Error(`Braze rejected the generated prefab: ${detail}`);
  }

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    model: {
      guid: modelRecord.guid,
      sourcePath: modelRecord.sourcePath,
      subAssets: modelRecord.subAssets.length,
    },
    prefab: {
      guid: prefabRecord.guid,
      sourcePath: prefabRecord.sourcePath,
      dependencies: prefabRecord.dependencies,
    },
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
