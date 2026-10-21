import React from "react";
import ReactDOM from "react-dom/client";
import { SceneWorkspaceRoot } from "./scene/components/SceneWorkspaceRoot";
import { AssetPreviewProvider } from "./assets/preview/AssetPreviewProvider";
import {
  type BrowserThreeWebGpuRenderSession,
} from "./rendering/adapters/browser-three-webgpu-session";
import { sharedBrowserRenderSessionOwner } from "./rendering/application/browser-render-session-owner";
import { RenderSessionProvider } from "./rendering/application/RenderSessionProvider";
import type { RendererFailureDiagnostic } from "./three/device-lifecycle";
import "./theme.css";
import "./styles.css";
import "./inspector.css";
import "./editor-theme.css";
import "./editor-chrome-theme.css";
import "./hierarchy/hierarchy-tree.css";
import "./editor-inspector-theme.css";
import "./viewport-hud.css";
import "./viewport-navigation-gizmo.css";
import "./gizmos-menu.css";
import "./scene-view-toolbar.css";
import "./game-view.css";
import "./editor-dock.css";
import "./ui/controls.css";
import "./styles/inspector-actions.css";
import "./editor/playback/scene-playback-feedback.css";
import "./editor/console/console-window.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const startup = new AbortController();
let renderSession: BrowserThreeWebGpuRenderSession | null = null;
let rootDisposed = false;
let rendererFailed = false;

function renderRendererFailure(diagnostic: RendererFailureDiagnostic): void {
  if (startup.signal.aborted || rootDisposed) return;
  root.render(
    <main className="three-host__fatal" role="alert">
      <strong>Renderer unavailable</strong>
      <span>{diagnostic.message}</span>
    </main>,
  );
}

root.render(<div role="status">Starting WebGPU renderer</div>);

void sharedBrowserRenderSessionOwner().acquire({
  signal: startup.signal,
  // Timestamp writes touch every Three render pass. Opt in only for a
  // diagnostic run with `?gpuTiming=1`; normal editor/player work stays clean.
  gpuTimingEnabled: new URLSearchParams(window.location.search).get("gpuTiming") === "1",
  onError: (error) => console.error("[render-session] operation failed", error),
  onRendererFailure: (diagnostic) => {
    rendererFailed = true;
    console.error(`[renderer:${diagnostic.kind}] ${diagnostic.message}`, { reason: diagnostic.reason });
    renderRendererFailure(diagnostic);
    renderSession?.dispose();
  },
})
  .then(async (session) => {
    if (startup.signal.aborted) {
      await session.disposeAsync();
      return;
    }
    renderSession = session;
    await session.ready;
    if (startup.signal.aborted || rendererFailed || session.getStatus() !== "ready") {
      await session.disposeAsync();
      return;
    }
    root.render(
      <RenderSessionProvider session={session}>
        <AssetPreviewProvider>
          <React.StrictMode>
            <SceneWorkspaceRoot />
          </React.StrictMode>
        </AssetPreviewProvider>
      </RenderSessionProvider>,
    );
  })
  .catch((error: unknown) => {
    if (startup.signal.aborted) return;
    renderRendererFailure({
      kind: "initialization",
      reason: "initialization-failed",
      message: `WebGPU renderer initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  });

const dispose = () => {
  if (startup.signal.aborted) return;
  startup.abort();
  const session = renderSession;
  renderSession = null;
  void session?.disposeAsync().catch((error: unknown) => {
    console.error("[render-session] shutdown failed", error);
  });
  if (!rootDisposed) {
    rootDisposed = true;
    root.unmount();
  }
};
const onPageHide = (event: PageTransitionEvent) => {
  if (!event.persisted) dispose();
};
window.addEventListener("pagehide", onPageHide);
(import.meta as ImportMeta & { hot?: { dispose: (callback: () => void) => void } }).hot?.dispose(() => {
  window.removeEventListener("pagehide", onPageHide);
  dispose();
});
