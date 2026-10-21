import { EngineLoop, type EngineLoopDriver } from "./engine-loop";

let sharedLoop: EngineLoop | null = null;
let removeVisibilityListener: (() => void) | null = null;

/** App-lifetime browser adapter for the demand-driven engine loop. */
export function sharedBrowserEngineLoop(): EngineLoop {
  if (sharedLoop) return sharedLoop;
  const driver: EngineLoopDriver = {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
    reportError: (error, phase) => console.error(`[engine-loop:${phase}] frame callback failed`, error),
  };
  const loop = new EngineLoop(driver);
  sharedLoop = loop;

  const syncVisibility = () => loop.setPaused(document.hidden);
  document.addEventListener("visibilitychange", syncVisibility);
  removeVisibilityListener = () => document.removeEventListener("visibilitychange", syncVisibility);
  syncVisibility();
  return loop;
}

/** Releases app-lifetime browser ownership during HMR or an explicit host shutdown. */
export function disposeSharedBrowserEngineLoop(): void {
  removeVisibilityListener?.();
  removeVisibilityListener = null;
  sharedLoop?.dispose();
  sharedLoop = null;
}

export function setSharedBrowserEngineTimeScale(value: number): void {
  sharedBrowserEngineLoop().setTimeScale(value);
}

export function sharedBrowserEngineTimeScale(): number {
  return sharedBrowserEngineLoop().getTimeScale();
}

type HotModule = { dispose: (callback: () => void) => void };
const hot = (import.meta as ImportMeta & { hot?: HotModule }).hot;
hot?.dispose(disposeSharedBrowserEngineLoop);
