import { primitiveForFilename } from "../../assets/import-support";
import type { AssetSubAsset, LibraryAsset } from "../../lib/asset-api";
import { versionedModelAssetUrl } from "../../lib/model-import-settings";
import { createAssetCache, type AssetCache } from "../../three/assets";
import {
  createImportedClipTimelinePresentation,
  type ImportedClipTimelinePresentation,
} from "../timeline/imported-clip-presentation";

export type ImportedClipTimelineLoadRequest = Readonly<{
  asset: LibraryAsset;
  subAsset: AssetSubAsset;
  importVersion?: string | null;
}>;

/** Loads one imported runtime Clip long enough to copy its read-only timeline. */
export class ImportedClipTimelineLoader {
  private generation = 0;
  private disposed = false;

  constructor(private readonly assetCache: AssetCache = createAssetCache()) {}

  async load(
    request: ImportedClipTimelineLoadRequest,
  ): Promise<ImportedClipTimelinePresentation | null> {
    if (this.disposed) throw new Error("The imported animation timeline loader is disposed.");
    const generation = ++this.generation;
    const clipIndex = runtimeClipIndex(request.subAsset);
    if (clipIndex === null) {
      throw new Error(`Animation clip ${request.subAsset.name || request.subAsset.localId} has no runtime index.`);
    }
    const revision = assetRevision(request);
    const lease = this.assetCache.acquire(
      versionedModelAssetUrl(request.asset.url, revision),
      primitiveForFilename(request.asset.filename),
    );
    try {
      const source = await lease.value;
      if (this.disposed || generation !== this.generation) return null;
      const clip = source.animations[clipIndex];
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) {
        throw new Error(
          `Animation clip ${request.subAsset.name || request.subAsset.localId} is absent from the imported runtime asset.`,
        );
      }
      const presentation = createImportedClipTimelinePresentation({
        clipName: request.subAsset.name || clip.name,
        durationSeconds: clip.duration,
        frameRate: finitePositive(request.subAsset.frameRate),
        tracks: clip.tracks.map((track) => ({
          name: track.name,
          keyTimesSeconds: track.times,
        })),
      });
      return this.disposed || generation !== this.generation ? null : presentation;
    } finally {
      lease.release();
    }
  }

  cancel(): void {
    this.generation += 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.assetCache.dispose();
  }
}

function runtimeClipIndex(subAsset: AssetSubAsset): number | null {
  return nonNegativeInteger(subAsset.runtimeClipIndex)
    ?? nonNegativeInteger(subAsset.sourceIndex);
}

function assetRevision(request: ImportedClipTimelineLoadRequest): string {
  const candidates = [
    request.importVersion,
    request.asset.contentRevision,
    request.asset.updatedAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "unversioned";
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
