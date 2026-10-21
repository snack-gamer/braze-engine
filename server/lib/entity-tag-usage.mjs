import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Explicit editor audit only; bounded IO, no watches and no runtime work. */
export async function collectEntityTagUsage({ scenesRoot, assetsRoot }) {
  const assignments = [], issues = [];
  let files = 0, entries = 0, bytes = 0, complete = true;
  const walk = async (root, directory, kind) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 10000) { complete = false; return; }
      if (entry.isSymbolicLink()) { issues.push(`Skipped symbolic link: ${entry.name}`); complete = false; continue; }
      if (entry.name.startsWith(".")) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await walk(root, file, kind); if (entries > 10000) return; continue; }
      if (!entry.isFile() || !(kind === "scene" ? /\.scene\.json$/.test(entry.name) : /\.(braze-prefab|tganprefab)\.json$/.test(entry.name))) continue;
      const source = `${kind}/${path.relative(root, file).replaceAll(path.sep, "/")}`;
      if (++files > 512) { complete = false; return; }
      try {
        const size = (await stat(file)).size;
        if (size > 8 * 1024 * 1024 || bytes + size > 32 * 1024 * 1024) throw Error("audit byte budget exceeded");
        const content = await readFile(file); bytes += content.length;
        if (content.length > 8 * 1024 * 1024 || bytes > 32 * 1024 * 1024) throw Error("audit byte budget exceeded");
        const document = JSON.parse(content.toString("utf8"));
        if (!Array.isArray(document.objects)) throw Error("missing objects array");
        for (const object of document.objects) {
          if (object.tags === undefined) continue;
          if (!Array.isArray(object.tags) || object.tags.length > 1 || object.tags.some((tag) => typeof tag !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,47}$/.test(tag))) throw Error("invalid entity tags");
          for (const tag of object.tags) {
            if (assignments.length >= 20000) { complete = false; return; }
            assignments.push({ tag, kind, source, objectId: String(object.id), objectName: String(object.name ?? object.id) });
          }
        }
      } catch (error) { complete = false; issues.push(`${source}: ${error.message}`); }
    }
  };
  for (const [directory, kind] of [[scenesRoot, "scene"], [assetsRoot, "prefab"]]) {
    try { const root = await realpath(directory); await walk(root, root, kind); }
    catch (error) { if (error.code !== "ENOENT") { complete = false; issues.push(String(error.message)); } }
  }
  return { assignments, complete, issues, files };
}
