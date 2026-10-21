import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { DocumentConflictError, readJsonDocument, writeJsonDocument } from "./json-document-store.mjs";
import { decodeInputActionMapAsset } from "../../src/input/serialization/input-action-map-asset-schema.mjs";
import { INPUT_ACTION_MAP_ASSET_SUFFIX, INPUT_ACTION_MAP_ASSET_MAX_BYTES } from "../../src/input/domain/input-action-map-asset-identity.mjs";

const writeQueues = new Map();

export class InputActionMapNotFoundError extends Error {
  constructor(filename) { super(`Input Action Map '${filename}' was not found.`); this.name = "InputActionMapNotFoundError"; }
}

export function validateInputActionMapFilename(filename) {
  if (typeof filename !== "string" || !filename.toLowerCase().endsWith(INPUT_ACTION_MAP_ASSET_SUFFIX)
    || filename.includes("\\") || /[\u0000-\u001f?#]/.test(filename) || filename.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(filename)
    || filename.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Input Action Map filename must be a project-relative .braze-input.json path.");
  return filename;
}

function within(root, file) {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function location(root, filename) {
  validateInputActionMapFilename(filename);
  const absoluteRoot = path.resolve(root), filePath = path.resolve(absoluteRoot, filename);
  if (!within(absoluteRoot, filePath)) throw new Error("Input Action Map source escapes the project assets folder.");
  await mkdir(absoluteRoot, { recursive: true });
  const canonicalRoot = await realpath(absoluteRoot);
  let existing = filePath;
  for (;;) {
    try {
      if (!within(canonicalRoot, await realpath(existing))) throw new Error("Input Action Map source escapes the project assets folder.");
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      existing = path.dirname(existing);
    }
  }
  return { filePath, filename };
}

async function readLocated(location) {
  try {
    if ((await stat(location.filePath)).size > INPUT_ACTION_MAP_ASSET_MAX_BYTES) throw new Error("Input Action Map asset exceeds 256 KiB.");
  } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  const current = await readJsonDocument(location.filePath);
  if (!current) return null;
  if (Buffer.byteLength(current.text, "utf8") > INPUT_ACTION_MAP_ASSET_MAX_BYTES) throw new Error("Input Action Map asset exceeds 256 KiB.");
  return { ...current, ...location, value: decodeInputActionMapAsset(current.value) };
}

function enqueue(filePath, operation) {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous.then(operation, operation), settled = next.then(() => undefined, () => undefined);
  writeQueues.set(filePath, settled);
  void settled.finally(() => { if (writeQueues.get(filePath) === settled) writeQueues.delete(filePath); });
  return next;
}

export async function readInputActionMapDocument({ root, filename }) {
  return readLocated(await location(root, filename));
}

async function writeDocument(options, creating) {
  const target = await location(options.root, options.filename), value = decodeInputActionMapAsset(options.document);
  return enqueue(target.filePath, async () => {
    if (options.expectedGuid !== undefined) {
      const metadata = await readJsonDocument(`${target.filePath}.braze.meta`);
      if (metadata?.value?.guid?.toLowerCase() !== options.expectedGuid.toLowerCase()
        || metadata.value.importer?.id !== "braze.input-action-map") throw new Error("Input Action Map asset identity changed since it was loaded. Refresh before saving.");
    }
    const current = await readLocated(target);
    if (!creating && !current) throw new InputActionMapNotFoundError(target.filename);
    const expectedRevision = creating ? null : options.expectedRevision;
    if (!creating && typeof expectedRevision !== "string") throw new Error("Input Action Map saves require the loaded revision.");
    if (expectedRevision !== (current?.revision ?? null)) throw new DocumentConflictError(expectedRevision, current?.revision ?? null);
    const result = await writeJsonDocument({ filePath: target.filePath, value, expectedRevision,
      backupDirectory: options.backupsRoot ? path.join(options.backupsRoot, ...target.filename.split("/")) : undefined });
    return { ...result, ...target, value };
  });
}

export function createInputActionMapDocument(options) { return writeDocument(options, true); }
export function writeInputActionMapDocument(options) { return writeDocument(options, false); }
