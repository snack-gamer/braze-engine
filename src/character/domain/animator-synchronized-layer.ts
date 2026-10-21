import type { AnimatorController, AnimatorLayer } from "./animator-controller";

/** Resolves the layer that owns transition structure inherited through a sync chain. */
export function resolveAnimatorTransitionLayer(
  controller: AnimatorController,
  layer: AnimatorLayer,
): AnimatorLayer {
  let current = layer;
  for (let remaining = controller.layers.length; current.syncedLayerId && remaining > 0; remaining -= 1) {
    const source = controller.layers.find((candidate) => candidate.id === current.syncedLayerId);
    if (!source) break;
    current = source;
  }
  return current;
}
