import type { bloom } from "three/addons/tsl/display/BloomNode.js";

// Three's BloomNode — selective bloom via threshold + radius. Four live
// uniforms, no `.toConst()` baking, so settings propagate without recompile.
// Output is an additive vec4 contribution; composite adds it after SSR.
type BloomNode = ReturnType<typeof bloom>;

export type BloomConfig = {
  enabled: boolean;
  strength: number;     // 0..2 — overall bloom intensity multiplier
  threshold: number;    // 0..1 — luma cutoff for what blooms
  smoothWidth: number;  // 0..1 — softness of the threshold ramp
  radius: number;       // 0..1 — bloom spread
};

export function applyBloomSettings(node: BloomNode, settings: BloomConfig): void {
  node.strength.value = settings.strength;
  node.threshold.value = settings.threshold;
  node.smoothWidth.value = settings.smoothWidth;
  node.radius.value = settings.radius;
}
