import type { ssr } from "three/addons/tsl/display/SSRNode.js";
import type { ScreenSpaceReflectionSettings } from "../../types";

// SSRNode internally calls `.toConst()` on `quality` (see line 494 of three's
// SSRNode.js), which bakes the march step count into the compiled shader.
// Other uniforms (maxDistance, thickness, opacity, blurQuality) are live.
// Composite handles recompile-on-change for quality by recreating the node
// when `ssrBakedParamsChanged` reports a delta.
type SsrNode = ReturnType<typeof ssr>;

export function configureSsrNode(node: SsrNode, settings: ScreenSpaceReflectionSettings | null): void {
  if (!settings) return;
  node.maxDistance.value = settings.maxDistance;
  node.thickness.value = settings.thickness;
  node.opacity.value = settings.opacity;
  node.quality.value = settings.quality;
  node.blurQuality.value = settings.blurQuality;
}

export function ssrBakedParamsChanged(
  next: ScreenSpaceReflectionSettings,
  prev: ScreenSpaceReflectionSettings | null,
): boolean {
  if (!prev) return true;
  return prev.quality !== next.quality;
}
