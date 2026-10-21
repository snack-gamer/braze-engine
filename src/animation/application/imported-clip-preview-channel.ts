import type { AssetRef } from "../../assets/domain/asset-reference";

export type ImportedClipPreviewSample = Readonly<{
  clipRef: AssetRef;
  timeSeconds: number;
}>;

export type ImportedClipPreviewSubscription = (
  listener: (sample: ImportedClipPreviewSample | null) => void,
) => () => void;

export type ImportedClipPreviewChannel = Readonly<{
  publish: (sample: ImportedClipPreviewSample) => void;
  clear: () => void;
  subscribe: ImportedClipPreviewSubscription;
}>;

/** Ephemeral Animation-window transport into the existing Scene viewport. */
export function createImportedClipPreviewChannel(): ImportedClipPreviewChannel {
  const listeners = new Set<(sample: ImportedClipPreviewSample | null) => void>();
  let current: ImportedClipPreviewSample | null = null;

  const notify = () => {
    for (const listener of [...listeners]) listener(current);
  };

  return {
    publish: (sample) => {
      current = {
        clipRef: { ...sample.clipRef },
        timeSeconds: Math.max(0, Number.isFinite(sample.timeSeconds) ? sample.timeSeconds : 0),
      };
      notify();
    },
    clear: () => {
      if (!current) return;
      current = null;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(current);
      return () => listeners.delete(listener);
    },
  };
}
