import type { BrowserThreeWebGpuRenderSession } from "../rendering/adapters/browser-three-webgpu-session";
import type { ThreeWebGpuSessionSurface } from "../rendering/adapters/three-webgpu-render-session-contract";
import type { ViewportRenderer } from "./renderer";

type AttachmentArgs = Readonly<{
  host: Pick<HTMLElement, "appendChild">;
  renderSession: BrowserThreeWebGpuRenderSession;
  renderSurfaceName: string;
  tabIndex: number;
}>;

export type ViewportRenderSurfaceAttachment = Readonly<{
  canvas: HTMLCanvasElement;
  renderer: ViewportRenderer;
  renderSurface: ThreeWebGpuSessionSurface;
  dispose: () => void;
}>;

/** Registers, configures, and attaches one session surface as a transaction. */
export function attachViewportRenderSurface(args: AttachmentArgs): ViewportRenderSurfaceAttachment {
  if (args.renderSession.getStatus() !== "ready") {
    throw new Error("A viewport requires a ready app-owned render session.");
  }
  const canvas = document.createElement("canvas");
  canvas.className = "three-render-layer";
  canvas.tabIndex = args.tabIndex;
  const renderSurface = args.renderSession.registerSurface(args.renderSurfaceName, canvas);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      renderSurface.dispose();
    } finally {
      canvas.remove();
    }
  };
  try {
    const capture: { renderer: ViewportRenderer | null } = { renderer: null };
    const configured = renderSurface.configure((renderer) => { capture.renderer = renderer; });
    if (!configured || !capture.renderer) {
      throw new Error("The app-owned renderer could not configure the viewport surface.");
    }
    args.host.appendChild(canvas);
    return { canvas, renderer: capture.renderer, renderSurface, dispose };
  } catch (error) {
    try { dispose(); } catch { /* Preserve the construction failure. */ }
    throw error;
  }
}
