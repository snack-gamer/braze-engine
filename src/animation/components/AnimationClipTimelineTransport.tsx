import { EditorIcon } from "../../ui/EditorIcon";

type AnimationClipTimelineTransportProps = Readonly<{
  timeSeconds: number;
  durationSeconds: number;
  frameRate: number;
  playing: boolean;
  looping: boolean;
  onMoveToStart: () => void;
  onMoveToPreviousKey: () => void;
  onTogglePlayback: () => void;
  onMoveToNextKey: () => void;
  onMoveToEnd: () => void;
  onToggleLooping: () => void;
  onSetTime: (timeSeconds: number) => void;
}>;

export function AnimationClipTimelineTransport({
  timeSeconds,
  durationSeconds,
  frameRate,
  playing,
  looping,
  onMoveToStart,
  onMoveToPreviousKey,
  onTogglePlayback,
  onMoveToNextKey,
  onMoveToEnd,
  onToggleLooping,
  onSetTime,
}: AnimationClipTimelineTransportProps) {
  const frame = Math.round(timeSeconds * frameRate);
  const maximumFrame = Math.round(durationSeconds * frameRate);
  return <div className="animation-clip-transport">
    <div className="animation-clip-transport__buttons">
      <TransportButton label="Start of clip" icon="jumpToStart" onClick={onMoveToStart} />
      <TransportButton label="Previous key" icon="previousFrame" onClick={onMoveToPreviousKey} />
      <TransportButton
        label={playing ? "Pause timeline" : "Play timeline"}
        icon={playing ? "pause" : "play"}
        primary
        onClick={onTogglePlayback}
      />
      <TransportButton label="Next key" icon="nextFrame" onClick={onMoveToNextKey} />
      <TransportButton label="End of clip" icon="jumpToEnd" onClick={onMoveToEnd} />
      <TransportButton
        label="Loop timeline"
        icon="loop"
        pressed={looping}
        onClick={onToggleLooping}
      />
    </div>
    <label className="animation-clip-transport__time" title="Current playhead frame">
      <span>{formatClipTime(timeSeconds, frameRate)}</span>
      <input
        type="number"
        min={0}
        max={maximumFrame}
        step={1}
        value={frame}
        aria-label="Animation playhead frame"
        onChange={(event) => onSetTime(Number(event.currentTarget.value) / frameRate)}
      />
    </label>
  </div>;
}

type TransportButtonProps = Readonly<{
  label: string;
  icon: "jumpToStart" | "previousFrame" | "play" | "pause" | "nextFrame" | "jumpToEnd" | "loop";
  primary?: boolean;
  pressed?: boolean;
  onClick: () => void;
}>;

function TransportButton({ label, icon, primary, pressed, onClick }: TransportButtonProps) {
  return <button
    type="button"
    className={`icon-button compact${primary ? " primary" : ""}${pressed ? " active" : ""}`}
    aria-label={label}
    aria-pressed={pressed}
    title={label}
    onClick={onClick}
  ><EditorIcon name={icon} size="control" /></button>;
}

export function formatClipTime(timeSeconds: number, frameRate: number): string {
  const fps = Math.max(1, Math.round(frameRate));
  const frames = Math.max(0, Math.round(timeSeconds * fps));
  return `${Math.floor(frames / fps)}:${String(frames % fps).padStart(2, "0")}`;
}
