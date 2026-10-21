import type { ThreeWebGpuRenderSession } from "../../rendering/adapters/three-webgpu-render-session-contract";
import { AssetPreviewRepository } from "./asset-preview-repository";
import {
  createAssetPreviewRenderer,
  disposeAssetPreviewUrl,
} from "./asset-preview-renderer";

export type AssetPreviewRuntime = Readonly<{
  repository: AssetPreviewRepository;
  dispose: () => void;
}>;

/** Owns generated-preview caching and rendering for one app render session. */
export function createAssetPreviewRuntime(
  session: ThreeWebGpuRenderSession,
): AssetPreviewRuntime {
  const renderer = createAssetPreviewRenderer(session);
  const repository = new AssetPreviewRepository({
    render: renderer.render,
    dispose: disposeAssetPreviewUrl,
  });
  let disposed = false;
  return {
    repository,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      repository.clear();
      renderer.dispose();
    },
  };
}
