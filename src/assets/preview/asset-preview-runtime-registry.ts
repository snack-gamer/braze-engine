import type { GeneratedAssetPreviewKind } from "./asset-preview-source";
import type { AssetPreviewRuntime } from "./asset-preview-runtime";

const activeRuntimes = new Set<AssetPreviewRuntime>();

export function registerAssetPreviewRuntime(runtime: AssetPreviewRuntime): () => void {
  activeRuntimes.add(runtime);
  return () => activeRuntimes.delete(runtime);
}

export function refreshRegisteredAssetPreviews(
  kind: GeneratedAssetPreviewKind,
  url: string,
  revision?: string | null,
): void {
  for (const runtime of activeRuntimes) {
    runtime.repository.refresh(kind, url, revision);
  }
}
