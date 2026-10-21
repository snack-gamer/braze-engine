import type { ThreeWebGpuRenderSession } from "../../rendering/adapters/three-webgpu-render-session-contract";
import { assetPreviewDimensions } from "./asset-preview-dimensions";
import { AssetPreviewRenderSurface } from "./asset-preview-render-surface";
import type { AssetPreviewDescriptor } from "./asset-preview-source";
import { prepareAssetPreview } from "./prepared-asset-preview";

export type AssetPreviewRenderer = Readonly<{
  render: (descriptor: AssetPreviewDescriptor, signal: AbortSignal) => Promise<string | null>;
  dispose: () => void;
}>;

/** Creates the app-session preview renderer backed by one serialized hidden surface. */
export function createAssetPreviewRenderer(
  session: ThreeWebGpuRenderSession,
): AssetPreviewRenderer {
  let surface: AssetPreviewRenderSurface | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let disposed = false;

  const renderOne = async (
    descriptor: AssetPreviewDescriptor,
    signal: AbortSignal,
  ): Promise<string | null> => {
    if (disposed || signal.aborted) return null;
    const dimensions = assetPreviewDimensions(descriptor.size ?? "thumbnail");
    const content = await prepareAssetPreview(
      descriptor,
      dimensions.width / dimensions.height,
      signal,
    );
    if (!content || disposed || signal.aborted) {
      content?.dispose();
      return null;
    }
    try {
      surface ??= new AssetPreviewRenderSurface(session);
      return await surface.render(content.scene, content.camera, dimensions, signal);
    } catch {
      return null;
    } finally {
      content.dispose();
    }
  };

  return {
    render: (descriptor, signal) => {
      const next = queue.then(
        () => renderOne(descriptor, signal),
        () => renderOne(descriptor, signal),
      );
      queue = next.then(() => undefined, () => undefined);
      return next;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      surface?.dispose();
      surface = null;
    },
  };
}

export function disposeAssetPreviewUrl(url: string): void {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
