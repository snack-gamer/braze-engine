import { useEffect, useReducer, useSyncExternalStore } from "react";
import type { AssetPreviewSnapshot } from "./asset-preview-repository";
import { refreshRegisteredAssetPreviews } from "./asset-preview-runtime-registry";
import { useAssetPreviewRepository } from "./AssetPreviewProvider";
import type {
  AssetPreviewDescriptor,
  AssetPreviewSize,
  GeneratedAssetPreviewKind,
  UrlAssetPreviewKind,
} from "./asset-preview-source";

const DISABLED_PREVIEW: AssetPreviewSnapshot = Object.freeze({ status: "idle", url: null });
type PreviewRefreshSignal = Readonly<{ sequence: number; revision: string | null }>;
const INITIAL_REFRESH_SIGNAL: PreviewRefreshSignal = Object.freeze({ sequence: 0, revision: null });
const refreshSignals = new Map<string, PreviewRefreshSignal>();
const refreshListeners = new Map<string, Set<() => void>>();
let refreshSequence = 0;

function refreshKey(kind: GeneratedAssetPreviewKind, url: string): string {
  return `${kind}\u0000${url}`;
}

export function useAssetPreviewRefreshSignal(
  kind: GeneratedAssetPreviewKind,
  url: string,
): PreviewRefreshSignal {
  const key = refreshKey(kind, url);
  return useSyncExternalStore(
    (listener) => {
      let listeners = refreshListeners.get(key);
      if (!listeners) {
        listeners = new Set();
        refreshListeners.set(key, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) refreshListeners.delete(key);
      };
    },
    () => refreshSignals.get(key) ?? INITIAL_REFRESH_SIGNAL,
    () => INITIAL_REFRESH_SIGNAL,
  );
}

export function useGeneratedAssetPreviewState(
  descriptor: AssetPreviewDescriptor,
  enabled: boolean,
): AssetPreviewSnapshot {
  const previews = useAssetPreviewRepository();
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const { kind, url } = descriptor;
  const size = descriptor.size ?? "thumbnail";
  const keyRevision = descriptor.revision ?? "";

  useEffect(() => {
    if (!enabled || !url) return;
    const current = descriptor;
    const unsubscribe = previews.subscribe(current, rerender);
    previews.request(current);
    return unsubscribe;
  }, [enabled, keyRevision, kind, previews, size, url]);

  return enabled && url ? previews.read(descriptor) : DISABLED_PREVIEW;
}

export function useAssetPreviewState(
  kind: UrlAssetPreviewKind,
  url: string,
  enabled: boolean,
  revision?: string | null,
  size: AssetPreviewSize = "thumbnail",
): AssetPreviewSnapshot {
  return useGeneratedAssetPreviewState({ kind, url, revision, size }, enabled);
}

export function useAssetPreview(
  kind: UrlAssetPreviewKind,
  url: string,
  enabled: boolean,
  revision?: string | null,
  size?: AssetPreviewSize,
): string | null {
  return useAssetPreviewState(kind, url, enabled, revision, size).url;
}

export function refreshAssetPreview(
  kind: GeneratedAssetPreviewKind,
  url: string,
  revision?: string | null,
): void {
  refreshRegisteredAssetPreviews(kind, url, revision);
  const key = refreshKey(kind, url);
  refreshSignals.set(key, Object.freeze({ sequence: ++refreshSequence, revision: revision ?? null }));
  refreshListeners.get(key)?.forEach((listener) => listener());
}
