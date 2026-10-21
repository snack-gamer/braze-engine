import { InspectorNumberInput } from "../../components/InspectorNumberInput";
import type { AnimatorParameter } from "../domain/animator-parameters";
import type { AnimatorClipMotion, AnimatorMotion } from "../domain/blend-tree";
import {
  characterAssetOptionKey,
  characterAssetOptionReference,
  type ImportedCharacterAssetOption,
} from "../application/imported-character-assets";
import {
  patchAnimatorClipMotion,
  type AnimatorMotionPath,
} from "../application/animator-motion-authoring";
import { AnimatorClipLoopSelect } from "./AnimatorClipLoopSelect";

type AnimatorClipMotionEditorProps = Readonly<{
  rootMotion: AnimatorMotion | null;
  path: AnimatorMotionPath;
  motion: AnimatorClipMotion;
  clips: readonly ImportedCharacterAssetOption[];
  numericParameters: readonly AnimatorParameter[];
  onChange: (motion: AnimatorMotion | null) => void;
}>;

export function AnimatorClipMotionEditor({
  rootMotion,
  path,
  motion,
  clips,
  numericParameters,
  onChange,
}: AnimatorClipMotionEditorProps) {
  const clipValue = characterAssetOptionKey(motion.clipRef);
  const selectedClip = clips.find((option) => characterAssetOptionKey(option.ref) === clipValue);
  const patch = (next: Parameters<typeof patchAnimatorClipMotion>[2]) => (
    onChange(patchAnimatorClipMotion(rootMotion, path, next))
  );
  return (
    <div className="animator-clip-motion-editor">
      <label>Clip<select
        aria-label="Animation clip"
        value={clipValue}
        onChange={(event) => {
          const clipRef = characterAssetOptionReference(event.currentTarget.value, clips);
          if (clipRef) patch({ clipRef });
        }}
      >
        {!selectedClip && <option value={clipValue}>Missing imported clip</option>}
        {clips.map((clip) => (
          <option key={characterAssetOptionKey(clip.ref)} value={characterAssetOptionKey(clip.ref)}>
            {clip.label}
          </option>
        ))}
      </select></label>
      <AnimatorClipLoopSelect
        value={motion.loopMode}
        sourceLooping={selectedClip?.sourceLooping}
        onChange={(loopMode) => patch({ loopMode })}
      />
      <label>Speed<InspectorNumberInput
        step={0.05}
        decimals={2}
        value={motion.speed}
        disabled={Boolean(motion.timeScaleParameterId)}
        ariaLabel="Clip motion speed"
        onChange={(speed) => {
          if (Number.isFinite(speed) && speed !== 0) patch({ speed });
        }}
      /></label>
      <label>Speed Parameter<select
        value={motion.timeScaleParameterId ?? ""}
        onChange={(event) => patch({ timeScaleParameterId: event.currentTarget.value || undefined })}
      >
        <option value="">None</option>
        {numericParameters.map((parameter) => (
          <option key={parameter.id} value={parameter.id}>{parameter.name}</option>
        ))}
      </select></label>
    </div>
  );
}
