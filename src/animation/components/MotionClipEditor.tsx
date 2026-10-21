import { formatTimecode } from "../time";
import type { SceneAnimationController } from "../hooks/useSceneAnimation";
import { EditorIcon } from "../../ui/EditorIcon";
import { EditorCheckbox } from "../../ui/controls";

type MotionClipEditorProps = {
  controller: SceneAnimationController;
};

function NumberCell({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="animation-clip-field">
      <span>{label}</span>
      <input
        className="editor-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(value.toFixed(3))}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

export function MotionClipEditor({ controller }: MotionClipEditorProps) {
  const track = controller.activeMotionTrack;
  if (!track || track.clips.length === 0) return null;

  return (
    <div className="animation-clip-editor" aria-label="Motion clip editor">
      {track.clips.map((clip) => (
        <div key={clip.id} className="animation-clip-editor__row">
          <button
            type="button"
            className="animation-clip-editor__name"
            onClick={() => controller.setPlayhead(clip.start)}
            title={clip.name}
          >
            <strong>{clip.name}</strong>
            <span>{formatTimecode(clip.start, controller.document.fps)}</span>
          </button>
          <NumberCell
            label="Start"
            value={clip.start}
            min={0}
            max={controller.document.duration}
            step={0.05}
            onChange={(start) => controller.updateMotionClip(track.id, clip.id, { start })}
          />
          <NumberCell
            label="Dur"
            value={clip.duration}
            min={0.1}
            step={0.05}
            onChange={(duration) => controller.updateMotionClip(track.id, clip.id, { duration })}
          />
          <NumberCell
            label="Offset"
            value={clip.offset}
            min={0}
            step={0.05}
            onChange={(offset) => controller.updateMotionClip(track.id, clip.id, { offset })}
          />
          <NumberCell
            label="Weight"
            value={clip.weight}
            min={0}
            max={1}
            step={0.05}
            onChange={(weight) => controller.updateMotionClip(track.id, clip.id, { weight })}
          />
          <label className="animation-clip-toggle" title="Retarget skeleton animation to selected character">
            <EditorCheckbox
              checked={clip.retarget}
              onChange={(event) => controller.updateMotionClip(track.id, clip.id, { retarget: event.currentTarget.checked })}
            />
            <span>Retarget</span>
          </label>
          <button
            type="button"
            className="icon-button animation-icon-button"
            onClick={() => controller.removeMotionClip(track.id, clip.id)}
            title="Delete motion clip"
            aria-label="Delete motion clip"
          >
            <EditorIcon name="delete" size="control" />
          </button>
        </div>
      ))}
    </div>
  );
}
