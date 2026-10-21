import { readFile } from "node:fs/promises";
import { parseGlbDocument } from "../../server/lib/assets/gltf-source-document.mjs";
import { parseFbxSource } from "../../server/lib/assets/fbx-source-loader.mjs";

function disposeParsedSource(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) materials.add(material);
  });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  for (const item of [...geometries, ...materials, ...textures, ...skeletons]) item.dispose();
  root.clear();
}

/** Use each format's parser so exported dependencies match requests made by its runtime loader. */
export async function playerModelDependencyUris(filename) {
  const lower = filename.toLowerCase();
  if (!/\.(gltf|glb|fbx)$/.test(lower)) return [];
  const bytes = await readFile(filename);
  if (lower.endsWith(".fbx")) {
    const urls = new Set();
    const root = parseFbxSource(bytes, (url) => urls.add(url));
    disposeParsedSource(root); return [...urls];
  }
  const document = lower.endsWith(".glb") ? parseGlbDocument(bytes) : JSON.parse(bytes.toString("utf8"));
  return [...new Set([...(document.buffers ?? []), ...(document.images ?? [])]
    .flatMap((entry) => typeof entry?.uri === "string" && entry.uri ? [entry.uri] : []))];
}
