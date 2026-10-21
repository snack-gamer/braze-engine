import type { ScenePlaybackMode } from "../types";

/** Retina-quality editor rendering without paying the full 2x pixel cost. */
export const MAX_INTERACTIVE_PIXEL_RATIO = 1.25;

type PixelRatioOptions = {
  devicePixelRatio: number;
  fixedRenderSize: boolean;
  lowResolution: boolean;
};

export function viewportPixelRatio({
  devicePixelRatio,
  fixedRenderSize,
  lowResolution,
}: PixelRatioOptions): number {
  if (fixedRenderSize || lowResolution) return 1;
  const ratio = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  return Math.min(Math.max(1, ratio), MAX_INTERACTIVE_PIXEL_RATIO);
}

/** Stops covered or detached viewport hosts as well as background tabs. */
export function viewportIsSuspended(documentHidden: boolean, hostClientRectCount: number): boolean {
  return documentHidden || hostClientRectCount === 0;
}

export type ViewportFrameActivity = {
  animatedCloners: boolean;
  activeModifiers: boolean;
  activeParticles: boolean;
  frameSkipped: boolean;
  deviceTaskPending: boolean;
  physicsPending: boolean;
  playbackMode: ScenePlaybackMode;
  sceneSettling: boolean;
  shadowUpdatePending: boolean;
  transientCameraMotion: boolean;
};

/** Static viewports stop requesting animation frames once their dirty frames settle. */
export function viewportNeedsAnotherFrame(activity: ViewportFrameActivity): boolean {
  return (
    activity.sceneSettling
    || activity.frameSkipped
    || activity.deviceTaskPending
    || activity.shadowUpdatePending
    || activity.transientCameraMotion
    || activity.animatedCloners
    || activity.activeModifiers
    || activity.physicsPending
    || activity.playbackMode === "playing"
    || (activity.playbackMode !== "paused" && activity.activeParticles)
  );
}
