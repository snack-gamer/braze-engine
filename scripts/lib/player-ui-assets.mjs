import { readFile } from "node:fs/promises";
import path from "node:path";

/** Script-created screens declare dependencies explicitly; never export the entire asset library. */
export async function readProjectUiAssets(projectRoot) {
  let source;
  try { source = await readFile(path.join(projectRoot, "braze.project.json"), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const refs = JSON.parse(source).uiAssets ?? [];
  if (!Array.isArray(refs) || refs.length > 256) throw new Error("braze.project.json uiAssets must be an array of at most 256 AssetRefs.");
  for (const ref of refs) if (!ref || typeof ref !== "object" || !/^[a-f0-9]{32}$/i.test(ref.guid)
    || ref.localId !== undefined && ref.localId !== "main" || Object.keys(ref).some((key) => !["guid", "localId"].includes(key))) throw new Error("uiAssets entries need a GUID and optional localId: main.");
  return refs;
}
export function validatePlayerUiAssets(scene, explicit, assets) {
  const refs = [...explicit];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.image) refs.push({ ...node.image, expected: "image" });
    for (const style of [node.style, ...(node.responsive ?? []).map((rule) => rule.style)]) if (style?.font) refs.push({ ...style.font, expected: "font" });
    for (const child of node.children ?? []) visit(child);
  };
  for (const object of scene?.objects ?? []) visit((object.ui_canvas ?? object.uiCanvas)?.root);
  const byGuid = new Map(assets.map((asset) => [asset.guid?.toLowerCase(), asset]));
  for (const ref of refs) {
    const asset = byGuid.get(ref.guid?.toLowerCase());
    if (!asset || !["font", "image"].includes(asset.kind) || ref.expected && ref.expected !== asset.kind || ["missing", "failed"].includes(asset.status)) throw new Error(`Missing or incompatible UI asset ${ref.guid}. Restore its source and metadata, or replace the reference.`);
  }
  return refs;
}
