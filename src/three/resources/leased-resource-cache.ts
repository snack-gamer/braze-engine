export type ResourceLease<T> = {
  readonly value: T;
  release: () => void;
};

export type ResourceCacheDiagnostics = {
  entries: number;
  activeEntries: number;
  idleEntries: number;
  references: number;
  estimatedBytes: number;
  idleEstimatedBytes: number;
  maxIdleEntries: number;
  maxIdleBytes: number;
  evictions: number;
  failedLoads: number;
};

type CacheEntry<T> = {
  key: string;
  value: T;
  references: number;
  estimatedBytes: number;
  lastUsed: number;
  indexed: boolean;
  disposed: boolean;
};

type CacheOptions<T> = {
  maxIdleEntries: number;
  maxIdleBytes: number;
  dispose: (value: T) => void;
  canEvict?: (value: T) => boolean;
};

/**
 * Reference-counted LRU storage for resources shared by multiple viewports.
 *
 * Budgets apply only to idle entries: active resources are never disposed to
 * satisfy a budget. Callers must release every lease they acquire.
 */
export class LeasedResourceCache<T> {
  private readonly indexed = new Map<string, CacheEntry<T>>();
  private readonly retained = new Set<CacheEntry<T>>();
  private clock = 0;
  private evictions = 0;
  private failedLoads = 0;

  constructor(private readonly options: CacheOptions<T>) {}

  acquire(key: string, create: () => T): ResourceLease<T> {
    let entry = this.indexed.get(key);
    if (!entry) {
      entry = {
        key,
        value: create(),
        references: 0,
        estimatedBytes: 0,
        lastUsed: ++this.clock,
        indexed: true,
        disposed: false,
      };
      this.indexed.set(key, entry);
      this.retained.add(entry);
    }
    entry.references += 1;
    entry.lastUsed = ++this.clock;

    let released = false;
    return {
      value: entry.value,
      release: () => {
        if (released) return;
        released = true;
        entry!.references = Math.max(0, entry!.references - 1);
        entry!.lastUsed = ++this.clock;
        if (!entry!.indexed && entry!.references === 0) this.disposeEntry(entry!);
        else this.prune();
      },
    };
  }

  has(key: string, value: T): boolean {
    return this.indexed.get(key)?.value === value;
  }

  /** Removes a value from lookup immediately while honoring outstanding leases. */
  invalidate(key: string, value: T, reason: "stale" | "failed" = "stale"): boolean {
    const entry = this.indexed.get(key);
    if (!entry || entry.value !== value) return false;
    this.indexed.delete(key);
    entry.indexed = false;
    if (reason === "failed") this.failedLoads += 1;
    if (entry.references === 0) this.disposeEntry(entry);
    return true;
  }

  updateEstimatedBytes(key: string, value: T, estimatedBytes: number): void {
    const entry = this.indexed.get(key);
    if (!entry || entry.value !== value) return;
    entry.estimatedBytes = Math.max(0, Math.round(estimatedBytes));
    entry.lastUsed = ++this.clock;
    this.prune();
  }

  /** Re-evaluates an entry after asynchronous loading makes it evictable. */
  touch(key: string, value: T): void {
    const entry = this.indexed.get(key);
    if (!entry || entry.value !== value) return;
    entry.lastUsed = ++this.clock;
    this.prune();
  }

  clearUnused(): void {
    for (const entry of [...this.indexed.values()]) {
      if (entry.references !== 0 || !this.canEvict(entry)) continue;
      this.evict(entry);
    }
  }

  diagnostics(): ResourceCacheDiagnostics {
    let activeEntries = 0;
    let idleEntries = 0;
    let references = 0;
    let estimatedBytes = 0;
    let idleEstimatedBytes = 0;
    for (const entry of this.retained) {
      references += entry.references;
      estimatedBytes += entry.estimatedBytes;
      if (entry.references > 0) activeEntries += 1;
      else {
        idleEntries += 1;
        idleEstimatedBytes += entry.estimatedBytes;
      }
    }
    return {
      entries: this.retained.size,
      activeEntries,
      idleEntries,
      references,
      estimatedBytes,
      idleEstimatedBytes,
      maxIdleEntries: this.options.maxIdleEntries,
      maxIdleBytes: this.options.maxIdleBytes,
      evictions: this.evictions,
      failedLoads: this.failedLoads,
    };
  }

  private canEvict(entry: CacheEntry<T>): boolean {
    return this.options.canEvict?.(entry.value) ?? true;
  }

  private prune(): void {
    const idle = [...this.indexed.values()]
      .filter((entry) => entry.references === 0 && this.canEvict(entry))
      .sort((left, right) => left.lastUsed - right.lastUsed);
    let idleBytes = idle.reduce((sum, entry) => sum + entry.estimatedBytes, 0);
    while (
      idle.length > this.options.maxIdleEntries ||
      idleBytes > this.options.maxIdleBytes
    ) {
      const entry = idle.shift();
      if (!entry) break;
      idleBytes -= entry.estimatedBytes;
      this.evict(entry);
    }
  }

  private evict(entry: CacheEntry<T>): void {
    if (!entry.indexed || entry.references !== 0) return;
    this.indexed.delete(entry.key);
    entry.indexed = false;
    this.evictions += 1;
    this.disposeEntry(entry);
  }

  private disposeEntry(entry: CacheEntry<T>): void {
    if (entry.disposed || entry.references !== 0) return;
    entry.disposed = true;
    this.retained.delete(entry);
    try {
      this.options.dispose(entry.value);
    } catch (error) {
      console.error("[resource-cache] Resource disposal failed", error);
    }
  }
}
