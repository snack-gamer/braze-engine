import { useTimelinePlaybackSnapshot } from "../../timeline/useTimelinePlaybackSnapshot";
import { EditorIcon } from "../../ui/EditorIcon";
import type { SceneAnimationController } from "../hooks/useSceneAnimation";
import { formatTimecode } from "../time";

type AnimationPlaybackStatusProps = {
  controller: SceneAnimationController;
  active: boolean;
};

export function AnimationPlaybackButton({ controller, active }: AnimationPlaybackStatusProps) {
  const playback = useTimelinePlaybackSnapshot(controller.playback, active);
  return (
    <button
      type="button"
      className="icon-button animation-icon-button primary"
      onClick={controller.togglePlayback}
      title={playback.playing ? "Pause" : "Play"}
      aria-label={playback.playing ? "Pause animation" : "Play animation"}
    >
      <EditorIcon name={playback.playing ? "pause" : "play"} size="control" />
    </button>
  );
}

export function AnimationPlaybackTimecode({ controller, active }: AnimationPlaybackStatusProps) {
  const playback = useTimelinePlaybackSnapshot(controller.playback, active);
  const { document } = controller;
  return (
    <div className="animation-timecode" aria-label="Current time">
      <strong>{formatTimecode(playback.time, playback.fps)}</strong>
      <span>{formatTimecode(document.duration, document.fps)}</span>
    </div>
  );
}
