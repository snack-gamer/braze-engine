import {
  assetPreviewKey,
  type AssetPreviewDescriptor,
  type GeneratedAssetPreviewKind,
} from "./asset-preview-source";

export type AssetPreviewSnapshot = Readonly<{
  status: "idle" | "loading" | "ready" | "failed";
  url: string | null;
}>;

type PreviewEntry = {
  key: string;
  descriptor: AssetPreviewDescriptor;
  generation: number;
  lastUsed: number;
  listeners: Set<() => void>;
  snapshot: AssetPreviewSnapshot;
  work: AbortController | null;
};

type AssetPreviewRepositoryOptions = {
  render: (descriptor: AssetPreviewDescriptor, signal: AbortSignal) => Promise<string | null>;
  dispose: (previewUrl: string) => void;
  maxRetained?: number;
};

const IDLE: AssetPreviewSnapshot = Object.freeze({ status: "idle", url: null });
const LOADING: AssetPreviewSnapshot = Object.freeze({ status: "loading", url: null });
const FAILED: AssetPreviewSnapshot = Object.freeze({ status: "failed", url: null });

/** Owns generated preview deduplication, bounded retention and async lifetime. */
export class AssetPreviewRepository {
  private readonly entries = new Map<string, PreviewEntry>();
  private readonly render: AssetPreviewRepositoryOptions["render"];
  private readonly dispose: AssetPreviewRepositoryOptions["dispose"];
  private readonly maxRetained: number;
  private accessSequence = 0;

  constructor(options: AssetPreviewRepositoryOptions) {
    this.render = options.render;
    this.dispose = options.dispose;
    this.maxRetained = Math.max(1, Math.floor(options.maxRetained ?? 48));
  }

  read(descriptor: AssetPreviewDescriptor): AssetPreviewSnapshot {
    const entry = this.entry(descriptor);
    entry.lastUsed = ++this.accessSequence;
    return entry.snapshot;
  }

  subscribe(descriptor: AssetPreviewDescriptor, listener: () => void): () => void {
    const entry = this.entry(descriptor);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && entry.snapshot.status === "loading") {
        entry.generation += 1;
        entry.work?.abort();
        entry.work = null;
        this.entries.delete(entry.key);
      }
      this.trim();
    };
  }

  request(descriptor: AssetPreviewDescriptor): void {
    const entry = this.entry(descriptor);
    if (entry.snapshot.status === "loading" || entry.snapshot.status === "ready") return;
    this.start(entry);
  }

  refresh(kind: GeneratedAssetPreviewKind, url: string, revision?: string | null): void {
    for (const entry of this.entries.values()) {
      if (entry.descriptor.kind !== kind || entry.descriptor.url !== url) continue;
      this.invalidate(entry);
      entry.descriptor = { ...entry.descriptor, revision: revision ?? entry.descriptor.revision };
      if (entry.listeners.size > 0) this.start(entry);
    }
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.generation += 1;
      entry.work?.abort();
      if (entry.snapshot.url) this.dispose(entry.snapshot.url);
      entry.listeners.clear();
    }
    this.entries.clear();
  }

  private entry(descriptor: AssetPreviewDescriptor): PreviewEntry {
    const key = assetPreviewKey(descriptor);
    const retained = this.entries.get(key);
    if (retained) return retained;
    const entry: PreviewEntry = {
      key,
      descriptor,
      generation: 0,
      lastUsed: ++this.accessSequence,
      listeners: new Set(),
      snapshot: IDLE,
      work: null,
    };
    this.entries.set(key, entry);
    return entry;
  }

  private invalidate(entry: PreviewEntry): void {
    entry.generation += 1;
    entry.work?.abort();
    entry.work = null;
    if (entry.snapshot.url) this.dispose(entry.snapshot.url);
    entry.snapshot = IDLE;
    this.notify(entry);
  }

  private start(entry: PreviewEntry): void {
    const generation = ++entry.generation;
    const work = new AbortController();
    entry.work = work;
    entry.snapshot = LOADING;
    this.notify(entry);
    void this.render(entry.descriptor, work.signal).then(
      (url) => {
        if (entry.generation !== generation || this.entries.get(entry.key) !== entry) {
          if (url) this.dispose(url);
          return;
        }
        entry.work = null;
        entry.lastUsed = ++this.accessSequence;
        entry.snapshot = url ? Object.freeze({ status: "ready", url }) : FAILED;
        this.notify(entry);
        this.trim();
      },
      () => {
        if (entry.generation !== generation) return;
        entry.work = null;
        entry.snapshot = FAILED;
        this.notify(entry);
        this.trim();
      },
    );
  }

  private notify(entry: PreviewEntry): void {
    entry.listeners.forEach((listener) => listener());
  }

  private trim(): void {
    const retained = [...this.entries.entries()]
      .filter(([, entry]) => entry.snapshot.status === "ready")
      .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
    let excess = retained.length - this.maxRetained;
    for (const [key, entry] of retained) {
      if (excess <= 0) break;
      if (entry.listeners.size > 0) continue;
      if (entry.snapshot.url) this.dispose(entry.snapshot.url);
      this.entries.delete(key);
      excess -= 1;
    }

    for (const [key, entry] of this.entries) {
      if (entry.listeners.size === 0 && entry.snapshot.status === "failed") this.entries.delete(key);
    }
  }
}
