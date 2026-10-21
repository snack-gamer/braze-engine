import { InspectorNumberInput } from "../../../components/InspectorNumberInput";
import {
  animatorClipPlaybackSettings,
  patchAnimatorClipPlayback,
} from "../../application/animator-clip-authoring";
import { patchScopedAnimatorState } from "../../application/animator-scoped-state-authoring";
import {
  characterAssetOptionKey,
  type ImportedCharacterAssetOption,
} from "../../application/imported-character-assets";
import type { AnimatorParameter } from "../../domain/animator-parameters";
import type { AnimatorController, AnimatorLayer, AnimatorState } from "../../domain/animator-controller";
import { findAnimatorState } from "../../domain/animator-state-machine";
import { AnimatorClipEventsSummary } from "./AnimatorClipEventsSummary";
import { AnimatorClipLoopSelect } from "../AnimatorClipLoopSelect";
import { inspectorHelpClass, inspectorSectionClass } from "./animator-inspector-classes";

type AnimatorClipInspectorSectionsProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  state: AnimatorState;
  clips: readonly ImportedCharacterAssetOption[];
  numericParameters: readonly AnimatorParameter[];
  onChange: (controller: AnimatorController) => void;
}>;

/** Owns the user-facing properties for an animation Clip node in any machine scope. */
export function AnimatorClipInspectorSections({
  controller,
  layer,
  state,
  clips,
  numericParameters,
  onChange,
}: AnimatorClipInspectorSectionsProps) {
  const motion = state.motion?.kind === "clip" ? state.motion : null;
  const clipValue = characterAssetOptionKey(motion?.clipRef);
  const selectedClip = clips.find((clip) => characterAssetOptionKey(clip.ref) === clipValue);
  const playback = motion ? animatorClipPlaybackSettings(state) : null;
  const isDefault = findAnimatorState(layer, state.id)?.owner.defaultStateId === state.id;
  const inheritsTiming = Boolean(layer.syncedLayerId);
  return <>
    {motion && playback && <section className={inspectorSectionClass}>
      <header><strong>Playback</strong>{isDefault && <span>Entry Clip</span>}</header>
      {inheritsTiming && <p className={inspectorHelpClass}>
        Speed and offset are inherited from the source layer.
      </p>}
      <AnimatorClipLoopSelect
        value={motion.loopMode}
        sourceLooping={selectedClip?.sourceLooping}
        onChange={(loopMode) => onChange(patchAnimatorClipPlayback(
          controller, layer.id, state.id, { loopMode },
        ))}
      />
      {!inheritsTiming && <div className="animator-inspector-grid">
        <label>Speed<InspectorNumberInput
          ariaLabel="Clip speed"
          step={0.05}
          decimals={2}
          value={playback.speed}
          disabled={Boolean(playback.speedParameterId)}
          onChange={(speed) => onChange(patchAnimatorClipPlayback(controller, layer.id, state.id, {
            speed,
          }))}
        /></label>
        <label>Start Offset<InspectorNumberInput
          ariaLabel="Clip start offset"
          step={0.05}
          decimals={2}
          value={state.cycleOffset}
          disabled={Boolean(state.cycleOffsetParameterId)}
          onChange={(cycleOffset) => onChange(patchScopedAnimatorState(controller, layer.id, state.id, {
            cycleOffset,
          }))}
        /></label>
      </div>}
      <div className="animator-check-row">
        <label className="animator-check"><input type="checkbox" checked={state.mirror} onChange={(event) => onChange(patchScopedAnimatorState(controller, layer.id, state.id, { mirror: event.currentTarget.checked }))} /> Mirror</label>
        <label className="animator-check"><input type="checkbox" checked={state.footIk} onChange={(event) => onChange(patchScopedAnimatorState(controller, layer.id, state.id, { footIk: event.currentTarget.checked }))} /> Foot IK</label>
      </div>
      <details className="animator-inspector-advanced">
        <summary>Advanced</summary>
        <label className="animator-check" title="Reset properties this Clip does not animate to their authored values. When off, uncovered properties keep values written by the previous Clip."><input type="checkbox" checked={state.writeDefaults} onChange={(event) => onChange(patchScopedAnimatorState(controller, layer.id, state.id, { writeDefaults: event.currentTarget.checked }))} /> Write Defaults</label>
        {!inheritsTiming
          && (numericParameters.length > 0 || playback.speedParameterId || state.cycleOffsetParameterId)
          && <div className="animator-inspector-grid">
          <ParameterSelect label="Speed Parameter" value={playback.speedParameterId} parameters={numericParameters} onChange={(speedParameterId) => onChange(patchAnimatorClipPlayback(controller, layer.id, state.id, { speedParameterId }))} />
          <ParameterSelect label="Offset Parameter" value={state.cycleOffsetParameterId} parameters={numericParameters} onChange={(cycleOffsetParameterId) => onChange(patchScopedAnimatorState(controller, layer.id, state.id, { cycleOffsetParameterId }))} />
        </div>}
      </details>
    </section>}
    {motion && <AnimatorClipEventsSummary clip={selectedClip} stateEvents={state.events} />}
  </>;
}

function ParameterSelect({ label, value, parameters, onChange }: Readonly<{
  label: string;
  value?: string;
  parameters: readonly AnimatorParameter[];
  onChange: (value: string | undefined) => void;
}>) {
  return <label>{label}<select value={value ?? ""} onChange={(event) => onChange(event.currentTarget.value || undefined)}>
    <option value="">None</option>{parameters.map((parameter) => <option key={parameter.id} value={parameter.id}>{parameter.name}</option>)}
  </select></label>;
}
