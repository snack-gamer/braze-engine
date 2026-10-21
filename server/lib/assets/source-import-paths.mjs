import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

export function sourceDestination(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || /[\\\u0000-\u001f:?#]/.test(value)
    || value.split("/").some((part) => !part || part.startsWith(".") || part.trim() !== part)
    || /\.meta$/i.test(value)) throw new Error("destination must be an Assets-relative file path (up to 1024 characters), without traversal, hidden segments, backslashes, URLs or metadata sidecars.");
  return value;
}

export async function existingSourcePath(filename) {
  try { return await lstat(filename); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

/** Do not follow a destination symlink, including a dangling link or a sidecar link. */
export async function sourceImportLocation(root, destination, { createParents = false } = {}) {
  sourceDestination(destination);
  if (createParents) await mkdir(root, { recursive: true });
  const rootExists = await existingSourcePath(root);
  const canonicalRoot = rootExists ? await realpath(root) : path.resolve(root);
  const parts = destination.split("/");
  let parent = canonicalRoot;
  for (const part of parts.slice(0, -1)) {
    parent = path.join(parent, part);
    const entry = await existingSourcePath(parent);
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) throw new Error(`Import destination parent is not a regular directory: ${part}`);
    if (!entry && createParents) await mkdir(parent);
  }
  const filename = path.join(parent, parts.at(-1));
  if (await existingSourcePath(filename) || await existingSourcePath(`${filename}.braze.meta`)) {
    throw new Error(`Import destination already exists: ${destination}. Choose a new path; existing sources and identities are never overwritten.`);
  }
  return filename;
}

export async function unusedSourceDestination(root, requested) {
  sourceDestination(requested);
  const extension = requested.match(/\.(?:braze-input|braze-prefab|tganprefab)\.json$/i)?.[0] ?? path.extname(requested);
  const stem = requested.slice(0, -extension.length || undefined);
  let candidate = requested, suffix = 1;
  while (await existingSourcePath(path.join(root, candidate)) || await existingSourcePath(path.join(root, `${candidate}.braze.meta`))) {
    candidate = `${stem} ${suffix++}${extension}`;
  }
  return candidate;
}
