import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  return match?.[1] ?? null;
}

function localBuildPath(value) {
  if (!value || /^(?:data:|https?:|\/\/)/i.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0].replace(/^\.\//, "").replace(/^\//, "");
  if (!pathname || pathname.split("/").includes("..")) return null;
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/** Returns the entry, module-preload, and stylesheet graph requested by player.html. */
export function initialPlayerResourcePaths(html) {
  const resources = new Set();
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    if (/^<script/i.test(tag)) {
      const source = localBuildPath(attribute(tag, "src"));
      if (source) resources.add(source);
      continue;
    }
    const rel = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes("modulepreload") && !rel.includes("stylesheet")) continue;
    const href = localBuildPath(attribute(tag, "href"));
    if (href) resources.add(href);
  }
  return [...resources].sort();
}

export function compressedByteLengths(source) {
  return {
    rawBytes: source.byteLength,
    gzipBytes: gzipSync(source, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(source, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

function sumSizes(entries) {
  return entries.reduce((total, entry) => ({
    rawBytes: total.rawBytes + entry.rawBytes,
    gzipBytes: total.gzipBytes + entry.gzipBytes,
    brotliBytes: total.brotliBytes + entry.brotliBytes,
  }), { rawBytes: 0, gzipBytes: 0, brotliBytes: 0 });
}

async function filesRecursively(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesRecursively(root, filename));
    else if (entry.isFile()) files.push(path.relative(root, filename).replace(/\\/g, "/"));
  }
  return files.sort();
}

async function measureFiles(root, filenames) {
  return Promise.all(filenames.map(async (filename) => ({
    filename,
    ...compressedByteLengths(await readFile(path.join(root, filename))),
  })));
}

export async function measurePlayerBuild(root) {
  const html = await readFile(path.join(root, "player.html"), "utf8");
  const allFiles = await filesRecursively(root);
  const javascriptFiles = allFiles.filter((filename) => filename.endsWith(".js"));
  const initialFiles = initialPlayerResourcePaths(html);
  const [javascriptEntries, initialEntries] = await Promise.all([
    measureFiles(root, javascriptFiles),
    measureFiles(root, initialFiles),
  ]);
  const contentFilename = path.join(root, "player-content.json");
  const content = compressedByteLengths(await readFile(contentFilename));
  const assets = await Promise.all(allFiles
    .filter((filename) => filename.startsWith("3d-models/") || filename.startsWith("hdri/"))
    .map(async (filename) => ({ filename, bytes: (await stat(path.join(root, filename))).size })));
  return {
    javascript: {
      count: javascriptEntries.length,
      ...sumSizes(javascriptEntries),
      largestRawBytes: Math.max(0, ...javascriptEntries.map((entry) => entry.rawBytes)),
      entries: javascriptEntries,
    },
    initial: {
      count: initialEntries.length,
      ...sumSizes(initialEntries),
      entries: initialEntries,
    },
    content,
    assets,
  };
}
