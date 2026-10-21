import { readdir } from "node:fs/promises";
import path from "node:path";
import { ASSET_META_SUFFIX } from "./asset-meta-store.mjs";

/** Discovers authored sources and Braze sidecars without indexing hidden/cache files. */
export async function discoverAssetFiles(root) {
  const sources = [];
  const sidecars = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith(ASSET_META_SUFFIX)) sidecars.push(absolute);
        else if (!lower.endsWith(".meta")) sources.push(absolute);
      }
    }
  }

  await visit(root);
  return { sources, sidecars };
}
