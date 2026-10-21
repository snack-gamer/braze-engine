import { EditorIcon } from "../ui/EditorIcon";
import {
  formatFrameTime,
  nextPlayMode,
  PLAY_MODE_LABELS,
} from "./sequencer-presentation";
import type {
  PrimeTimelineDocument,
  PrimeTimelineFrameMode,
  PrimeTimelineSample,
} from "./types";
import type { PrimeTimelineController } from "./usePrimeTimeline";

type SequencerHeaderProps = Readonly<{
  controller: PrimeTimelineController;
  document: PrimeTimelineDocument;
  playback: PrimeTimelineSample;
}>;

/** Transport plus authored frame/range controls. */
export function SequencerHeader({ controller, document, playback }: SequencerHeaderProps) {
  return (
    <div className="prime-sequencer__header">
      <div className="prime-sequencer__transport">
        <button type="button" className="icon-button prime-sequencer__button" title="Preview start" onClick={controller.jumpToStart}>
          <EditorIcon name="jumpToStart" size="control" />
        </button>
        <button type="button" className="icon-button prime-sequencer__button" title="Previous frame" onClick={() => controller.stepFrame(-1)}>
          <EditorIcon name="previousFrame" size="control" />
        </button>
        <button type="button" className="icon-button prime-sequencer__button" title="Play backward" onClick={controller.playBackward}>
          <EditorIcon name="playBackward" size="control" />
        </button>
        <button
          type="button"
          className="icon-button primary prime-sequencer__button prime-sequencer__button--primary"
          title={playback.playing ? "Pause" : "Play"}
          onClick={controller.togglePlayback}
        >
          <EditorIcon name={playback.playing ? "pause" : "play"} size="control" />
        </button>
        <button type="button" className="icon-button prime-sequencer__button" title="Next frame" onClick={() => controller.stepFrame(1)}>
          <EditorIcon name="nextFrame" size="control" />
        </button>
        <button type="button" className="icon-button prime-sequencer__button" title="Preview end" onClick={controller.jumpToEnd}>
          <EditorIcon name="jumpToEnd" size="control" />
        </button>
        <button
          type="button"
          className={document.playMode === "once" ? "icon-button prime-sequencer__button" : "icon-button prime-sequencer__button active"}
          title={PLAY_MODE_LABELS[document.playMode]}
          onClick={() => controller.setPlayMode(nextPlayMode(document.playMode))}
        >
          <EditorIcon name={document.playMode === "once" ? "playOnce" : "loop"} size="control" />
        </button>
      </div>

      <div className="prime-sequencer__title">
        <EditorIcon name="animation" size="control" />
        <strong>Sequencer</strong>
        <span>{formatFrameTime(playback.frame, document.fps)}</span>
      </div>

      <div className="prime-sequencer__fields">
        <label title="Current frame">
          <span>F</span>
          <input
            className="editor-input"
            type="number"
            value={playback.frame}
            min={document.minFrame}
            max={document.maxFrame}
            step={1}
            onChange={(event) => controller.setFrame(Number(event.currentTarget.value))}
          />
        </label>
        <label title="Frames per second">
          <span>FPS</span>
          <input
            className="editor-input"
            type="number"
            value={document.fps}
            min={1}
            max={240}
            step={1}
            onChange={(event) => controller.setFps(Number(event.currentTarget.value))}
          />
        </label>
        <label title="Preview start">
          <span>In</span>
          <input
            className="editor-input"
            type="number"
            value={document.previewStartFrame}
            min={document.minFrame}
            max={document.previewEndFrame}
            step={1}
            onChange={(event) => controller.setPreviewRange(Number(event.currentTarget.value), document.previewEndFrame)}
          />
        </label>
        <label title="Preview end">
          <span>Out</span>
          <input
            className="editor-input"
            type="number"
            value={document.previewEndFrame}
            min={document.previewStartFrame}
            max={document.maxFrame}
            step={1}
            onChange={(event) => controller.setPreviewRange(document.previewStartFrame, Number(event.currentTarget.value))}
          />
        </label>
        <select
          className="editor-select"
          value={document.frameMode}
          aria-label="Frame mode"
          onChange={(event) => controller.setFrameMode(event.currentTarget.value as PrimeTimelineFrameMode)}
        >
          <option value="realtime">Realtime</option>
          <option value="allFrames">All Frames</option>
        </select>
      </div>
    </div>
  );
}
