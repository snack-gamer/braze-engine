import { uploadAsset } from "../lib/api";
import { describeAnimationClips, loadAndPrepareAsset } from "../three/assets";
import { disposeImportedAssetSource } from "../three/resources/imported-asset-lifetime";
import type { PrimitiveKind } from "../types";
import { motionClipSourceId } from "./motion";
import type { MotionClipSource } from "./types";

function primitiveFromFilename(filename: string): PrimitiveKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".fbx")) return "fbx";
  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) return "gltf";
  if (lower.endsWith(".usdz")) return "usdz";
  if (lower.endsWith(".usd")) return "usd";
  return null;
}

export async function importMotionClipSources(
  objectId: string,
  files: FileList | File[],
): Promise<MotionClipSource[]> {
  const imported: MotionClipSource[] = [];
  for (const file of Array.from(files)) {
    const primitive = primitiveFromFilename(file.name);
    if (!primitive) continue;
    const asset = await uploadAsset(file);
    const loaded = await loadAndPrepareAsset(asset.url, primitive);
    try {
      const clips = describeAnimationClips(loaded.animations, asset.url, primitive);
      imported.push(
        ...clips.map((clip) => ({
          id: motionClipSourceId(objectId, clip.id),
          objectId,
          sourceUrl: clip.sourceUrl,
          sourceType: clip.sourceType,
          name: clip.name,
          duration: clip.duration,
          trackCount: clip.trackCount,
          clipIndex: clip.index,
          retarget: true,
          assetName: asset.name,
        })),
      );
    } finally {
      disposeImportedAssetSource(loaded);
    }
  }
  return imported;
}
