import type { AnimatedTransformChannels } from "../components/scene/SceneInspector";
import type { TransformAnimationTrack } from "./types";

const TRANSFORM_PROPERTIES = ["position", "rotation", "scale"] as const;

export function animatedTransformChannelsForTrack(
  track: TransformAnimationTrack | undefined,
): AnimatedTransformChannels {
  const animated: AnimatedTransformChannels = {};
  for (const property of TRANSFORM_PROPERTIES) animated[property] = [false, false, false];
  if (!track?.enabled) return animated;
  for (const channel of track.channels) {
    if (channel.enabled === false || channel.keys.length === 0) continue;
    animated[channel.property]![channel.axis] = true;
  }
  return animated;
}
