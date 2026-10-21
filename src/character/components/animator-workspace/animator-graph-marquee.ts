import {
  animatorGraphNodeSize,
  type AnimatorGraphNode,
} from "../../application/animator-graph-model";
import type { AnimatorGraphViewport } from "./animator-graph-viewport";
import type { AnimatorGraphMarqueeBox } from "./useAnimatorGraphMarquee";

/** Resolves screen-space marquee overlap against authored Clip nodes. */
export function animatorClipIdsInMarquee(
  nodes: readonly AnimatorGraphNode[],
  box: AnimatorGraphMarqueeBox,
  view: AnimatorGraphViewport,
): string[] {
  const left = (box.left - view.x) / view.scale;
  const top = (box.top - view.y) / view.scale;
  const right = (box.left + box.width - view.x) / view.scale;
  const bottom = (box.top + box.height - view.y) / view.scale;
  return nodes.flatMap((node) => {
    if (node.kind !== "state" || !node.stateId) return [];
    const size = animatorGraphNodeSize(node);
    const overlaps = node.x <= right
      && node.x + size.width >= left
      && node.y <= bottom
      && node.y + size.height >= top;
    return overlaps ? [node.stateId] : [];
  });
}
