export type ViewportConstructionLifetime = Readonly<{
  defer: (cleanup: () => void) => void;
  /** Runs registered cleanup in reverse acquisition order. Idempotent. */
  dispose: () => void;
  /** Transfers ownership to the completed viewport without running cleanup. */
  release: () => void;
}>;

/** Collects rollback actions while a viewport's resources are being assembled. */
export function createViewportConstructionLifetime(): ViewportConstructionLifetime {
  const cleanups: Array<() => void> = [];
  let settled = false;

  return Object.freeze({
    defer: (cleanup) => {
      if (settled) throw new Error("Cannot add resources to a settled viewport construction.");
      cleanups.push(cleanup);
    },
    dispose: () => {
      if (settled) return;
      settled = true;
      for (let index = cleanups.length - 1; index >= 0; index -= 1) {
        try { cleanups[index](); } catch { /* Rollback must continue releasing later owners. */ }
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
