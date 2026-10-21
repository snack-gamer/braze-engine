import { sharedBrowserEngineLoop } from "../runtime/browser-engine-loop";
import type { EngineFrame, EngineLoop } from "../runtime/engine-loop";
import type { ViewportDiagnostics } from "./viewport-diagnostics";

type VisibilitySource = Readonly<{
  hidden: boolean;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}>;

type ViewportFrameSchedulerArgs = Readonly<{
  diagnostics: Pick<ViewportDiagnostics, "setRenderLoopActive">;
  onFrame: (frame: EngineFrame) => void;
  onVisible: () => void;
  loop?: Pick<EngineLoop, "createParticipant">;
  visibility?: VisibilitySource;
}>;

export type ViewportFrameScheduler = Readonly<{
  requestFrame: () => void;
  cancelFrame: () => void;
  dispose: () => void;
}>;

/** Demand-driven viewport participation in the app's single browser EngineLoop. */
export function createViewportFrameScheduler({
  diagnostics,
  onFrame,
  onVisible,
  loop = sharedBrowserEngineLoop(),
  visibility = document,
}: ViewportFrameSchedulerArgs): ViewportFrameScheduler {
  let disposed = false;
  const participant = loop.createParticipant({ render: onFrame });

  const requestFrame = () => {
    if (disposed || visibility.hidden) return;
    participant.requestFrame();
    diagnostics.setRenderLoopActive(true);
  };
  const cancelFrame = () => {
    participant.cancelFrame();
  };
  const onVisibilityChange = () => {
    if (visibility.hidden) {
      cancelFrame();
      diagnostics.setRenderLoopActive(false);
    } else {
      onVisible();
    }
  };
  visibility.addEventListener("visibilitychange", onVisibilityChange);

  return {
    requestFrame,
    cancelFrame,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      participant.dispose();
      visibility.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
