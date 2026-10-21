import ReactDOM from "react-dom/client";
import { installBundledModelImportDocuments } from "../../assets/application/model-import-document-provider";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { sharedBrowserRenderSessionOwner } from "../../rendering/application/browser-render-session-owner";
import { installBundledModelImportSettings } from "../../three/model-import-settings";
import type { RendererFailureDiagnostic } from "../../three/device-lifecycle";
import { PlayerApplication } from "../components/PlayerApplication";
import type { PlayerTimelinePlayback } from "../runtime/player-timeline-playback";
import { decodePlayerPackage } from "../serialization/player-package-codec";

export type PlayerDisposer = () => void;

export type MountPlayerOptions = Readonly<{
  signal?: AbortSignal;
  onRendererFailure?: (diagnostic: RendererFailureDiagnostic) => void;
}>;

/** Hydrates one immutable package and transfers its browser resources to the mounted player. */
export async function mountPlayer(
  rootElement: HTMLElement,
  rawPackage: unknown,
  options: MountPlayerOptions = {},
): Promise<PlayerDisposer> {
  options.signal?.throwIfAborted();
  const playerPackage = decodePlayerPackage(rawPackage);
  let uninstallImportDocuments: (() => void) | null = null;
  let uninstallImportSettings: (() => void) | null = null;
  let timeline: PlayerTimelinePlayback | null = null;
  let renderSession: BrowserThreeWebGpuRenderSession | null = null;
  let root: ReturnType<typeof ReactDOM.createRoot> | null = null;
  let disposed = false;
  const reportCleanupError = (owner: string, error: unknown) => {
    try { console.error(`[player] Failed to dispose ${owner}.`, error); } catch { /* Diagnostics are contained. */ }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener("abort", dispose);
    try { root?.unmount(); } catch (error) { reportCleanupError("React root", error); }
    try { timeline?.dispose(); } catch (error) { reportCleanupError("timeline", error); }
    try {
      const disposal = renderSession?.disposeAsync();
      void disposal?.catch((error: unknown) => reportCleanupError("render session", error));
    } catch (error) { reportCleanupError("render session", error); }
    try { uninstallImportSettings?.(); } catch (error) { reportCleanupError("model import settings", error); }
    try { uninstallImportDocuments?.(); } catch (error) { reportCleanupError("model import documents", error); }
  };
  options.signal?.addEventListener("abort", dispose, { once: true });
  try {
    uninstallImportDocuments = installBundledModelImportDocuments(
      playerPackage.modelImportDocuments,
    );
    uninstallImportSettings = installBundledModelImportSettings(
      Object.fromEntries(Object.entries(playerPackage.modelImportDocuments).map(
        ([filename, document]) => [filename, document.settings],
      )),
    );
    if (playerPackage.features.timeline) {
      const { createPlayerTimelinePlayback } = await import("../runtime/player-timeline-playback");
      options.signal?.throwIfAborted();
      timeline = createPlayerTimelinePlayback(playerPackage.scene.timeline);
    }
    renderSession = await sharedBrowserRenderSessionOwner().acquire({
      signal: options.signal,
      deviceScopeId: `player-${crypto.randomUUID()}`,
      gpuTimingEnabled: new URLSearchParams(window.location.search).get("gpuTiming") === "1",
      onError: (error) => console.error("[player-render-session] operation failed", error),
      onRendererFailure: (diagnostic) => {
        console.error(`[player-renderer:${diagnostic.kind}] ${diagnostic.message}`, {
          reason: diagnostic.reason,
        });
        dispose();
        if (!options.signal?.aborted) {
          try { options.onRendererFailure?.(diagnostic); } catch (error) {
            reportCleanupError("renderer failure observer", error);
          }
        }
      },
    });
    if (disposed || options.signal?.aborted) {
      await renderSession.disposeAsync();
      options.signal?.throwIfAborted();
      throw new Error("Player startup was disposed before renderer readiness.");
    }
    await renderSession.ready;
    options.signal?.throwIfAborted();
    if (disposed || renderSession.getStatus() !== "ready") {
      await renderSession.disposeAsync();
      throw new Error("Player renderer became unavailable during startup.");
    }
    root = ReactDOM.createRoot(rootElement);
    root.render(
      <PlayerApplication
        playerPackage={playerPackage}
        renderSession={renderSession}
        timeline={timeline}
      />,
    );
    timeline?.start();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
