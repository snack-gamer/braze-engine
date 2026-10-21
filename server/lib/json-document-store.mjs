import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

export class DocumentConflictError extends Error {
  constructor(expectedRevision, actualRevision) {
    super("Document changed since it was loaded. Reload before saving again.");
    this.name = "DocumentConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export function documentRevision(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function serializeJsonDocument(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Writes complete bytes through a unique, synced temporary file. Consumers
 * that do not need revisions/backups still share the same cleanup guarantee. */
export async function writeTextAtomic(filePath, text) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function readJsonDocument(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  try {
    return { value: JSON.parse(text), revision: documentRevision(text), text };
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    if (error?.code !== "EINVAL" && error?.code !== "ENOTSUP") throw error;
  } finally {
    await handle?.close();
  }
}

async function preserveBackup(filePath, backupDirectory, revision, limit) {
  if (!backupDirectory || limit <= 0) return;
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backupName = `${stamp}.${revision.slice(0, 12)}.${randomBytes(3).toString("hex")}.json`;
  await copyFile(filePath, path.join(backupDirectory, backupName), fsConstants.COPYFILE_EXCL);

  const entries = (await readdir(backupDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(entries.slice(limit).map((name) => unlink(path.join(backupDirectory, name))));
}

export async function writeJsonDocument({
  filePath,
  value,
  expectedRevision,
  backupDirectory,
  backupLimit = 8,
}) {
  const current = await readJsonDocument(filePath);
  const actualRevision = current?.revision ?? null;
  if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
    throw new DocumentConflictError(expectedRevision, actualRevision);
  }

  const text = serializeJsonDocument(value);
  if (current?.text === text) return { revision: current.revision, changed: false };

  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  if (current) await preserveBackup(filePath, backupDirectory, current.revision, backupLimit);
  await writeTextAtomic(filePath, text);

  return { revision: documentRevision(text), changed: true };
}
