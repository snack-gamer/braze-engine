import { EditorIcon } from "../../../ui/EditorIcon";
import {
  canPrepareAnimatorBlendTreeKind,
  replaceAnimatorBlendTreeStateKind,
} from "../../application/animator-blend-tree-state-authoring";
import {
  patchScopedAnimatorState,
  removeScopedAnimatorState,
  setScopedAnimatorStateMotion,
} from "../../application/animator-scoped-state-authoring";
import type { ImportedCharacterAssetOption } from "../../application/imported-character-assets";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import { findAnimatorState, findAnimatorStateMachine } from "../../domain/animator-state-machine";
import { AnimatorMotionEditor } from "../AnimatorMotionEditor";
import { CommittedTextInput } from "../CommittedTextInput";
import { AnimatorMotionSpace } from "./AnimatorMotionSpace";
import { AnimatorClipInspectorSections } from "./AnimatorClipInspectorSections";
import {
  inspectorContentClass,
  inspectorDangerButtonClass,
  inspectorHelpClass,
  inspectorSectionClass,
  inspectorTitleClass,
} from "./animator-inspector-classes";
import type { AnimatorPreview } from "./useAnimatorPreview";

type AnimatorStateInspectorProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateId: string;
  selectedBlendChildId?: string;
  clips: readonly ImportedCharacterAssetOption[];
  preview: AnimatorPreview;
  onChange: (controller: AnimatorController) => void;
  onDeleted: () => void;
  onSelectTransition: (transitionId: string) => void;
}>;

export function AnimatorStateInspector({
  controller,
  layer,
  stateId,
  selectedBlendChildId,
  clips,
  preview,
  onChange,
  onDeleted,
  onSelectTransition,
}: AnimatorStateInspectorProps) {
  const location = findAnimatorState(layer, stateId);
  const state = location?.state;
  if (!state || !location) return null;
  const numericParameters = controller.parameters.filter((parameter) => (
    parameter.kind === "float" || parameter.kind === "integer"
  ));
  const clipFocused = !state.motion || state.motion.kind === "clip";
  const inheritsStructure = Boolean(layer.syncedLayerId);
  return (
    <div className={inspectorContentClass}>
      <header className={inspectorTitleClass}>
        <div><small>{clipFocused ? "Clip" : "Blend Tree"}</small>{inheritsStructure
          ? <strong>{state.name}</strong>
          : <CommittedTextInput value={state.name} ariaLabel={clipFocused ? "Clip name" : "Blend Tree name"} onCommit={(name) => onChange(patchScopedAnimatorState(controller, layer.id, state.id, { name }))} />}</div>
        {!inheritsStructure && <button type="button" className={inspectorDangerButtonClass} title="Delete state" onClick={() => {
          onChange(removeScopedAnimatorState(controller, layer.id, state.id));
          onDeleted();
        }}><EditorIcon name="delete" size="row-action" /></button>}
      </header>
      {clipFocused ? <AnimatorClipInspectorSections
        controller={controller}
        layer={layer}
        state={state}
        clips={clips}
        numericParameters={numericParameters}
        onChange={onChange}
      /> : <><section className={`${inspectorSectionClass} animator-state-motion`}>
        <header><strong>Motions &amp; Thresholds</strong></header>
        <AnimatorMotionEditor
          rootMotion={state.motion}
          clips={clips}
          numericParameters={numericParameters}
          selectedChildId={selectedBlendChildId}
          canChangeRootBlendType={(kind) => canPrepareAnimatorBlendTreeKind(controller, kind)}
          onRootBlendTypeChange={(kind) => onChange(replaceAnimatorBlendTreeStateKind(
            controller,
            layer.id,
            state.id,
            kind,
          ))}
          onChange={(motion) => onChange(setScopedAnimatorStateMotion(
            controller,
            layer.id,
            state.id,
            motion,
          ))}
        />
      </section>
      <AnimatorMotionSpace
        motion={state.motion}
        clips={clips}
        parameters={controller.parameters}
        values={preview.values}
        onSetParameter={preview.setParameter}
      /></>}
      {inheritsStructure ? <section className={inspectorSectionClass}>
        <header><strong>Transitions</strong><span>Inherited</span></header>
        <p className={inspectorHelpClass}>
          Inherited from the source layer.
        </p>
      </section> : <section className={inspectorSectionClass}>
        <header><strong>Outgoing edges</strong><span>{state.transitions.length}</span></header>
        {state.transitions.map((transition) => (
          <button type="button" key={transition.id} className="animator-edge-row" onClick={() => onSelectTransition(transition.id)}>
            <span>→ {destinationName(layer, transition, !location.ownerMachineId)}</span>
            <small>{transition.conditions.length} conditions</small>
          </button>
        ))}
        {state.transitions.length === 0 && <p className="animator-inspector-empty">Use the node output port to connect this {clipFocused ? "Clip" : "Blend Tree"}.</p>}
      </section>}
    </div>
  );
}

function destinationName(
  layer: AnimatorLayer,
  transition: AnimatorLayer["states"][number]["transitions"][number],
  exitsLayer: boolean,
): string {
  if (transition.destination.kind === "exit") return exitsLayer ? "Exit Layer" : "Exit";
  if (transition.destination.kind === "stateMachine") {
    return findAnimatorStateMachine(layer, transition.destination.stateMachineId)?.machine.name
      ?? "Missing state machine";
  }
  const stateId = transition.destination.stateId;
  return findAnimatorState(layer, stateId)?.state.name ?? "Missing state";
}
