export type PreviewResourceLifetime = Readonly<{
  defer: (cleanup: () => void) => void;
  /** Runs registered cleanup in reverse acquisition order. Idempotent. */
  dispose: () => void;
  /** Transfers completed construction to its long-lived owner. */
  release: () => void;
}>;

/** Contains one preview cleanup and reports failure without stranding later owners. */
export function disposePreviewResource(owner: string, cleanup: () => void): void {
  try {
    cleanup();
  } catch (error) {
    reportPreviewCleanupFailure(owner, error);
  }
}

/** Contains preview-constructor rollback without crossing feature ownership. */
export function createPreviewResourceLifetime(owner: string): PreviewResourceLifetime {
  const cleanups: Array<() => void> = [];
  let settled = false;

  return Object.freeze({
    defer: (cleanup) => {
      if (settled) throw new Error("Cannot add resources to a settled preview lifetime.");
      cleanups.push(cleanup);
    },
    dispose: () => {
      if (settled) return;
      settled = true;
      for (let index = cleanups.length - 1; index >= 0; index -= 1) {
        disposePreviewResource(owner, cleanups[index]);
      }
      cleanups.length = 0;
    },
    release: () => {
      if (settled) return;
      settled = true;
      cleanups.length = 0;
    },
  });
}

function reportPreviewCleanupFailure(owner: string, error: unknown): void {
  try {
    console.error(`[asset-preview] Failed to dispose ${owner}.`, error);
  } catch {
    // Diagnostics must never interrupt disposal.
  }
}
