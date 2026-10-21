import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { refreshAssetDatabase } from "../../server/lib/assets/asset-database-store.mjs";
import { decodeInputActionMapAsset } from "../../src/input/serialization/input-action-map-asset-schema.mjs";
import { decodeProjectInput, decodeCapturedProjectInput } from "../../src/input/serialization/project-input-schema.mjs";
import { INPUT_ACTION_MAP_ASSET_MAX_BYTES } from "../../src/input/domain/input-action-map-asset-identity.mjs";
import { validateInputActionMapFilename } from "../../server/lib/input-action-map-document-store.mjs";

export const PROJECT_INPUT_ENDPOINT = "/__braze/project-input";

function within(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function readProjectJson(filename, root, maximumBytes) {
  if (!within(root, filename) || !within(await realpath(root), await realpath(filename))) throw new Error("Project Input source escapes the project root.");
  if ((await stat(filename)).size > maximumBytes) throw new Error("Project Input source exceeds its byte limit.");
  const bytes = await readFile(filename);
  if (bytes.length > maximumBytes) throw new Error("Project Input source grew beyond its byte limit while loading.");
  return { value: JSON.parse(bytes.toString("utf8")), bytes };
}

/** Durable GUID resolution; saved file bytes are the only runtime input source. */
export async function loadInputActionMapSource(selection, assets, assetsRoot) {
  const settings = decodeProjectInput(selection);
  if (!settings.actionMap) return undefined;
  const ref = settings.actionMap, matches = assets.filter((asset) => asset.guid?.toLowerCase() === ref.guid);
  if (matches.length !== 1) throw new Error(`Project Input Action Map ${ref.guid} is missing or ambiguous in the Asset Database.`);
  const asset = matches[0];
  if (asset.kind !== "inputActionMap" || asset.status !== "ready" || asset.importerId !== "braze.input-action-map") throw new Error(`Project Input Action Map ${ref.guid} is not a ready Input Action Map asset.`);
  const filename = validateInputActionMapFilename(asset.filename ?? asset.sourcePath);
  const canonicalRoot = await realpath(assetsRoot), source = path.resolve(canonicalRoot, filename);
  const { value, bytes } = await readProjectJson(source, canonicalRoot, INPUT_ACTION_MAP_ASSET_MAX_BYTES);
  const meta = await readProjectJson(`${source}.braze.meta`, canonicalRoot, 256 * 1024);
  if (meta.value.guid?.toLowerCase() !== ref.guid || meta.value.importer?.id !== "braze.input-action-map") throw new Error("Project Input Action Map metadata changed while capturing the saved source.");
  return decodeCapturedProjectInput({ asset: ref, revision: createHash("sha256").update(bytes).digest("hex"), document: decodeInputActionMapAsset(value) });
}

function configuredPath(root, config, key, fallback) {
  const value = config[key] ?? fallback;
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0") || path.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error(`Invalid Project Input ${key}.`);
  const filename = path.resolve(root, value);
  if (!within(root, filename)) throw new Error(`Project Input ${key} escapes the project root.`);
  return filename;
}

export async function loadProjectInputActionMap(projectRoot) {
  const root = path.resolve(projectRoot), configFile = path.join(root, "braze.project.json");
  const config = existsSync(configFile) ? (await readProjectJson(configFile, root, 1024 * 1024)).value : {};
  const projectFile = configuredPath(root, config, "projectFile", "project.json");
  const selection = decodeProjectInput(existsSync(projectFile) ? (await readProjectJson(projectFile, root, 8 * 1024 * 1024)).value.input : undefined);
  if (!selection.actionMap) return undefined;
  const assetsRoot = configuredPath(root, config, "assetsPath", "assets");
  if (!within(await realpath(root), await realpath(assetsRoot))) throw new Error("Project Input assets folder escapes the project root.");
  const libraryRoot = configuredPath(root, config, "libraryPath", ".braze/Library");
  let ancestor = libraryRoot;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!within(await realpath(root), await realpath(ancestor))) throw new Error("Project Input Library folder escapes the project root.");
  const index = await refreshAssetDatabase({ assetsRoot, indexFile: path.join(libraryRoot, "asset-index.json") });
  return loadInputActionMapSource(selection, index.records, assetsRoot);
}
