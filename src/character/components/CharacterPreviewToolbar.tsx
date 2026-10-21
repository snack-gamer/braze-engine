import { EditorIcon } from "../../ui/EditorIcon";
import { EditorRange } from "../../ui/controls/EditorRange";
import type { CharacterPreviewClip, CharacterPreviewPlayback } from "../adapters/three/three-character-preview-extension";
import { GridSettingsPopover } from "../../ui/GridSettingsControls";
import "./CharacterPreviewToolbar.css";

type CharacterPreviewToolbarProps = Readonly<{
  clips: readonly CharacterPreviewClip[];
  playback: CharacterPreviewPlayback;
  skeletonVisible: boolean;
  gridVisible: boolean;
  gridOpacity: number;
  showAnimationControls?: boolean;
  onClipChange: (index: number | null) => void;
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (timeSeconds: number) => void;
  onSkeletonVisibleChange: (visible: boolean) => void;
  onGridVisibleChange: (visible: boolean) => void;
  onGridOpacityChange: (opacity: number) => void;
  onResetPose: () => void;
  onResetView: () => void;
}>;

export function CharacterPreviewToolbar({
  clips,
  playback,
  skeletonVisible,
  gridVisible,
  gridOpacity,
  showAnimationControls = true,
  onClipChange,
  onPlayingChange,
  onTimeChange,
  onSkeletonVisibleChange,
  onGridVisibleChange,
  onGridOpacityChange,
  onResetPose,
  onResetView,
}: CharacterPreviewToolbarProps) {
  const duration = Math.max(0.001, playback.durationSeconds);
  const currentTime = Math.max(0, Math.min(playback.timeSeconds, duration));
  return (
    <div
      className={`character-preview-toolbar${showAnimationControls ? "" : " character-preview-toolbar--display-only"}`}
      role="toolbar"
      aria-label="Character preview controls"
    >
      {showAnimationControls && <div className="character-preview-toolbar__player" role="group" aria-label="Animation preview player">
        <button
          type="button"
          className={`icon-button character-preview-toolbar__play ${playback.playing ? "active" : ""}`}
          onClick={() => onPlayingChange(!playback.playing)}
          disabled={playback.clipIndex === null}
          aria-label={playback.playing ? "Pause animation preview" : "Play animation preview"}
          aria-pressed={playback.playing}
          title={playback.playing ? "Pause animation preview" : "Play animation preview"}
        >
          <EditorIcon name={playback.playing ? "pause" : "play"} size="control" filled />
        </button>
        <select
          aria-label="Preview animation clip"
          value={playback.clipIndex ?? ""}
          onChange={(event) => onClipChange(event.currentTarget.value === "" ? null : Number(event.currentTarget.value))}
        >
          {clips.length === 0 && <option value="">No animation clips</option>}
          {clips.map((clip) => <option key={`${clip.index}:${clip.name}`} value={clip.index}>{clip.name}</option>)}
        </select>
        <EditorRange
          min={0}
          max={duration}
          step={Math.max(0.001, playback.durationSeconds / 240)}
          value={currentTime}
          onChange={(event) => onTimeChange(Number(event.currentTarget.value))}
          disabled={playback.clipIndex === null}
          aria-label="Animation timeline"
          aria-valuetext={`${clock(playback.timeSeconds)} of ${clock(playback.durationSeconds)}`}
        />
        <output aria-label="Animation time">
          <strong>{clock(playback.timeSeconds)}</strong>
          <span aria-hidden="true">/</span>
          <span>{clock(playback.durationSeconds)}</span>
        </output>
      </div>}
      <div className="character-preview-toolbar__tools" role="group" aria-label="Preview display options">
        <GridSettingsPopover
          placement="above"
          visible={gridVisible}
          opacity={gridOpacity}
          onVisibleChange={onGridVisibleChange}
          onOpacityChange={onGridOpacityChange}
        />
        <button
          type="button"
          className={`ghost-button compact ${skeletonVisible ? "active" : ""}`}
          aria-pressed={skeletonVisible}
          onClick={() => onSkeletonVisibleChange(!skeletonVisible)}
        >
          Skeleton
        </button>
        <button type="button" className="icon-button" onClick={onResetPose} title="Reset to imported pose">
          <EditorIcon name="reset" size="control" />
        </button>
        <button type="button" className="icon-button" onClick={onResetView} title="Frame character">
          <EditorIcon name="focus" size="control" />
        </button>
      </div>
    </div>
  );
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00.00";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${(safe - minutes * 60).toFixed(2).padStart(5, "0")}`;
}
