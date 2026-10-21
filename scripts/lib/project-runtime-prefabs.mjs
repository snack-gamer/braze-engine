import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { capturePrefabResources } from "./runtime-prefab-resources.mjs";
import { validatePrefabAnimationTargetCapacity } from "./runtime-prefab-animation-resources.mjs";

export const RUNTIME_PREFAB_ENDPOINT = "/__braze/runtime-prefabs";

export function readRuntimePrefabReferences(projectRoot) {
  const filename = path.join(projectRoot, "braze.project.json");
  if (!existsSync(filename)) return [];
  const config = JSON.parse(readFileSync(filename, "utf8")), refs = config.runtimePrefabs ?? [];
  if (!Array.isArray(refs) || refs.length > 32 || (refs.length && !config.gameplayEntry)) {
    throw new Error("runtimePrefabs requires at most 32 AssetRefs, a gameplayEntry.");
  }
  const seen = new Set();
  return refs.map((ref) => {
    if (!ref || typeof ref.guid !== "string" || !/^[a-f0-9]{32}$/i.test(ref.guid) || (ref.localId !== undefined && ref.localId !== "main")) throw new Error("runtimePrefabs entries must be prefab AssetRefs with a GUID and optional localId 'main'.");
    const guid = ref.guid.toLowerCase();
    if (seen.has(guid)) throw new Error(`Duplicate runtime prefab ${guid}.`);
    seen.add(guid); return { guid, localId: "main" };
  });
}

/** Resolve durable IDs through the Asset Database; paths never become project identity. */
export async function loadRuntimePrefabSources(refs, assets, assetsRoot, indexRecords = [], materials = [], characterAssets = {}) {
  if (!refs.length) return [];
  const canonicalRoot = await realpath(assetsRoot);
  let total = 0;
  const sources = [];
  for (const asset of refs) {
    const matches = assets.filter((item) => item.guid?.toLowerCase() === asset.guid);
    if (matches.length !== 1) throw new Error(`Runtime prefab ${asset.guid} is missing or ambiguous in the Asset Database.`);
    const record = matches[0];
    if (record.kind !== "prefab" || (record.status && record.status !== "ready")) throw new Error(`Runtime prefab ${asset.guid} is not a ready prefab asset.`);
    const filename = await realpath(path.resolve(assetsRoot, record.filename));
    const relative = path.relative(canonicalRoot, filename);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Runtime prefab source escapes the project assets folder.");
    const size = (await stat(filename)).size;
    if (size > 1024 * 1024 || total + size > 8 * 1024 * 1024) throw new Error("Runtime prefab sources exceed the 1 MiB asset / 8 MiB catalog limit.");
    const bytes = await readFile(filename);
    total += bytes.length;
    if (bytes.length > 1024 * 1024 || total > 8 * 1024 * 1024) throw new Error("Runtime prefab grew beyond the asset limit while loading.");
    const document = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(document?.objects) || document.objects.length < 1 || document.objects.length > 128) throw new Error("Runtime prefabs require 1–128 saved nodes.");
    const resources = capturePrefabResources(document, assets, indexRecords, materials, characterAssets);
    sources.push({ ...(resources ? { resources } : {}), asset, name: record.name, revision: createHash("sha256").update(bytes).digest("hex"), document });
  }
  validatePrefabAnimationTargetCapacity(sources.map((source) => source.document));
  return sources;
}

export async function loadProjectRuntimePrefabs(projectRoot) {
  const refs = readRuntimePrefabReferences(projectRoot); if (!refs.length) return [];
  const [{ listAssets }, { ASSETS_ROOT, PROJECT_ROOT, PROJECT_FILE, LIBRARY_ROOT }] = await Promise.all([
    import("../../server/lib/assets/library-asset-records.mjs"), import("../../server/lib/paths.mjs"),
  ]);
  if (path.resolve(projectRoot) !== path.resolve(PROJECT_ROOT)) throw new Error("Runtime prefab loader must use the active project Asset Database.");
  const assets = await listAssets();
  const [index, project] = await Promise.all([readFile(path.join(LIBRARY_ROOT, "asset-index.json"), "utf8"), readFile(PROJECT_FILE, "utf8")]);
  const saved = JSON.parse(project);
  const characterAssets = saved.characterAssets ?? { version: "braze/character-assets-v0", animatorControllers: saved.animatorControllers ?? [], avatarMasks: saved.avatarMasks ?? [] };
  return loadRuntimePrefabSources(refs, assets, ASSETS_ROOT, JSON.parse(index).records ?? [], saved.materials ?? [], characterAssets);
}
