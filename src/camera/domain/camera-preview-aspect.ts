const DEFAULT_CAMERA_PREVIEW_ASPECT = 16 / 9;

function validAspect(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Resolves the aspect used by an authored camera's Scene-view frustum.
 * A fixed Game-view target wins; Free Aspect follows the live pane. */
export function resolveCameraPreviewAspect(
  targetAspect: number | null | undefined,
  paneAspect: number,
): number {
  if (validAspect(targetAspect)) return targetAspect;
  if (validAspect(paneAspect)) return paneAspect;
  return DEFAULT_CAMERA_PREVIEW_ASPECT;
}
