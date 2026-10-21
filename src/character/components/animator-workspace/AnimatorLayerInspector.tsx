import { InspectorNumberInput } from "../../../components/InspectorNumberInput";
import { EditorIcon } from "../../../ui/EditorIcon";
import {
  patchAnimatorLayer,
  removeAnimatorLayer,
  setAnimatorLayerSynchronization,
} from "../../application/animator-controller-authoring";
import { characterAssetOptionKey } from "../../application/imported-character-assets";
import { characterAssetReference, type AuthoredAvatarMask } from "../../domain/character-asset-library";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import { findAnimatorState, findAnimatorStateMachine } from "../../domain/animator-state-machine";
import { CommittedTextInput } from "../CommittedTextInput";
import {
  inspectorContentClass,
  inspectorDangerButtonClass,
  inspectorHelpClass,
  inspectorSectionClass,
  inspectorTitleClass,
} from "./animator-inspector-classes";

type AnimatorLayerInspectorProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  masks: readonly AuthoredAvatarMask[];
  onChange: (controller: AnimatorController) => void;
  onDeleted: (layerId: string) => void;
  onSelectReaction: (transitionId: string) => void;
}>;

export function AnimatorLayerInspector({ controller, layer, masks, onChange, onDeleted, onSelectReaction }: AnimatorLayerInspectorProps) {
  const base = controller.layers[0]?.id === layer.id;
  const maskValue = characterAssetOptionKey(layer.avatarMaskRef);
  return (
    <div className={inspectorContentClass}>
      <header className={inspectorTitleClass}>
        <div><small>Layer</small><CommittedTextInput value={layer.name} ariaLabel="Layer name" onCommit={(name) => onChange(patchAnimatorLayer(controller, layer.id, { name }))} /></div>
        {!base && <button type="button" className={inspectorDangerButtonClass} title="Delete layer" onClick={() => {
          const next = removeAnimatorLayer(controller, layer.id);
          onChange(next);
          onDeleted(next.layers[0]!.id);
        }}><EditorIcon name="delete" size="row-action" /></button>}
      </header>
      <section className={inspectorSectionClass}>
        <header><strong>Layer blend</strong><span>{base ? "Base" : layer.blendingMode}</span></header>
        <div className="animator-inspector-grid">
          <label>Weight<InspectorNumberInput value={base ? 1 : layer.weight} min={0} max={1} step={0.05} decimals={2} disabled={base} ariaLabel="Layer weight" onChange={(weight) => onChange(patchAnimatorLayer(controller, layer.id, { weight }))} /></label>
          <label>Blend<select value={base ? "override" : layer.blendingMode} disabled={base} onChange={(event) => onChange(patchAnimatorLayer(controller, layer.id, { blendingMode: event.currentTarget.value as AnimatorLayer["blendingMode"] }))}>
            <option value="override">Override</option><option value="additive">Additive</option>
          </select></label>
        </div>
        <label>Avatar Mask<select value={maskValue} onChange={(event) => {
          const mask = masks.find((candidate) => characterAssetOptionKey(characterAssetReference(candidate)) === event.currentTarget.value);
          onChange(patchAnimatorLayer(controller, layer.id, { avatarMaskRef: mask ? characterAssetReference(mask) : undefined }));
        }}><option value="">Full body</option>{masks.map((mask) => <option key={mask.id} value={characterAssetOptionKey(characterAssetReference(mask))}>{mask.name}</option>)}</select></label>
        <label className="animator-check"><input type="checkbox" checked={layer.ikPass} onChange={(event) => onChange(patchAnimatorLayer(controller, layer.id, { ikPass: event.currentTarget.checked }))} /> IK pass</label>
      </section>
      {!base && <section className={inspectorSectionClass}>
        <header><strong>Synchronization</strong></header>
        <label>State source<select value={layer.syncedLayerId ?? ""} onChange={(event) => onChange(setAnimatorLayerSynchronization(controller, layer.id, event.currentTarget.value || undefined, layer.syncedLayerAffectsTiming))}>
          <option value="">Independent</option>{controller.layers.filter((candidate) => candidate.id !== layer.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label>
        {layer.syncedLayerId && <label className="animator-check"><input type="checkbox" checked={layer.syncedLayerAffectsTiming === true} onChange={(event) => onChange(setAnimatorLayerSynchronization(controller, layer.id, layer.syncedLayerId, event.currentTarget.checked))} /> Override source timing</label>}
      </section>}
      <section className={inspectorSectionClass}>
        <header><strong>Reaction Router</strong><span>
          {layer.syncedLayerId ? "Inherited" : layer.anyStateTransitions.length}
        </span></header>
        <p className={inspectorHelpClass}>{layer.syncedLayerId
          ? "Inherited from the source layer."
          : "Use for hit, stun, death, or landing. Keep normal flow on state edges."}
        </p>
        {!layer.syncedLayerId && layer.anyStateTransitions.map((transition) => <button type="button" key={transition.id} className="animator-edge-row" onClick={() => onSelectReaction(transition.id)}>
          <span>→ {destinationName(layer, transition)}</span>
          <small>{transition.conditions.length} conditions</small>
        </button>)}
      </section>
    </div>
  );
}

function destinationName(layer: AnimatorLayer, transition: AnimatorLayer["anyStateTransitions"][number]): string {
  if (transition.destination.kind === "exit") return "Exit Layer";
  if (transition.destination.kind === "stateMachine") {
    return findAnimatorStateMachine(layer, transition.destination.stateMachineId)?.machine.name
      ?? "Missing state machine";
  }
  const stateId = transition.destination.stateId;
  return findAnimatorState(layer, stateId)?.state.name ?? "Missing state";
}
