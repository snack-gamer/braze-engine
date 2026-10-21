import { primitiveForFilename } from "../../../assets/import-support";
import type { LibraryAsset, ModelImportDocument } from "../../../lib/asset-api";
import { versionedModelAssetUrl } from "../../../lib/model-import-settings";
import type { AssetLease, LoadedAsset } from "../../../three/assets";
import type { Runtime } from "../../../three/runtime";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "../../runtime/diagnostics";

export type ThreeAnimatorSourceLease = Readonly<{
  value: Promise<CharacterRuntimeResult<LoadedAsset>>;
  release: () => void;
}>;

type SourceEntry = {
  guid: string;
  pins: number;
  retained: boolean;
  lease: AssetLease | null;
  value: Promise<CharacterRuntimeResult<LoadedAsset>>;
};

/** Owns a small LRU of external model leases while a Play snapshot resolves clips. */
export class ThreeAnimatorSourceLeaseCache {
  private readonly entries = new Map<string, SourceEntry>();
  private disposed = false;

  constructor(
    private readonly runtime: Pick<Runtime, "assetCache" | "disposed">,
    private readonly maximumResidentSources: number,
  ) {}

  acquire(
    asset: LibraryAsset,
    document: Promise<CharacterRuntimeResult<ModelImportDocument>>,
  ): ThreeAnimatorSourceLease {
    if (this.disposed || this.runtime.disposed) return {
      value: Promise.resolve(disposedSource(asset.filename)),
      release: () => undefined,
    };
    const guid = asset.guid!.toLowerCase();
    let entry = this.entries.get(guid);
    if (!entry) {
      entry = {
        guid,
        pins: 0,
        retained: true,
        lease: null,
        value: Promise.resolve(characterRuntimeFailure(
          "uninitialized-animator-source",
          "External animation source did not initialize.",
        )),
      };
      entry.value = this.load(entry, asset, document);
      this.entries.set(guid, entry);
    } else {
      this.entries.delete(guid);
      this.entries.set(guid, entry);
    }
    entry.pins += 1;
    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        entry!.pins = Math.max(0, entry!.pins - 1);
        this.trim();
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.retained = false;
      this.releaseLease(entry);
    }
    this.entries.clear();
  }

  private async load(
    entry: SourceEntry,
    asset: LibraryAsset,
    document: Promise<CharacterRuntimeResult<ModelImportDocument>>,
  ): Promise<CharacterRuntimeResult<LoadedAsset>> {
    const imported = await document;
    if (!imported.value) return { value: null, diagnostics: imported.diagnostics };
    if (this.disposed || !entry.retained || this.runtime.disposed) return disposedSource(asset.filename);
    try {
      entry.lease = this.runtime.assetCache.acquire(
        versionedModelAssetUrl(asset.url, imported.value.importVersion),
        primitiveForFilename(asset.filename),
      );
      const source = await entry.lease.value;
      if (this.disposed || !entry.retained || this.runtime.disposed) {
        this.releaseLease(entry);
        return characterRuntimeFailure({
          code: "stale-animator-source-load",
          severity: "warning",
          message: `External animation source ${asset.filename} completed after disposal.`,
        });
      }
      return characterRuntimeSuccess(source);
    } catch (error) {
      this.releaseLease(entry);
      return characterRuntimeFailure(
        "external-animation-source-load-failed",
        `Could not load ${asset.filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private trim(): void {
    while (this.entries.size > this.maximumResidentSources) {
      const oldest = [...this.entries.values()].find((entry) => entry.pins === 0);
      if (!oldest) return;
      this.entries.delete(oldest.guid);
      oldest.retained = false;
      this.releaseLease(oldest);
    }
  }

  private releaseLease(entry: SourceEntry): void {
    entry.lease?.release();
    entry.lease = null;
  }
}

function disposedSource(filename: string): CharacterRuntimeResult<LoadedAsset> {
  return characterRuntimeFailure({
    code: "disposed-animator-asset-resolver",
    severity: "warning",
    message: `External animation source ${filename} was cancelled with the Play session.`,
  });
}
