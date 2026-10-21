import { EditorIcon } from "../../../ui/EditorIcon";
import {
  characterAssetOptionKey,
  type ImportedCharacterAssetOption,
} from "../../application/imported-character-assets";
import {
  patchAnimatorTransition,
  removeAnimatorTransition,
  type AnimatorTransitionPatch,
  type AnimatorTransitionSource,
} from "../../application/animator-transition-authoring";
import type { AnimatorController, AnimatorLayer, AnimatorTransition } from "../../domain/animator-controller";
import {
  findAnimatorState,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";
import { resolveAnimatorTransitionLayer } from "../../domain/animator-synchronized-layer";
import { AnimatorConditionList } from "./AnimatorConditionList";
import {
  inspectorContentClass,
  inspectorDangerButtonClass,
  inspectorHelpClass,
  inspectorSectionClass,
  inspectorTitleClass,
} from "./animator-inspector-classes";
import { AnimatorCrossfadeEditor } from "./AnimatorCrossfadeEditor";

type AnimatorTransitionInspectorProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  source: AnimatorTransitionSource;
  transitionId: string;
  clips: readonly ImportedCharacterAssetOption[];
  playbackProgress?: number;
  onChange: (controller: AnimatorController) => void;
  onDeleted: () => void;
}>;

export function AnimatorTransitionInspector({
  controller,
  layer,
  source,
  transitionId,
  clips,
  playbackProgress,
  onChange,
  onDeleted,
}: AnimatorTransitionInspectorProps) {
  const transition = transitionFor(
    resolveAnimatorTransitionLayer(controller, layer),
    source,
    transitionId,
  );
  if (!transition) return null;
  const isExitRoute = source.kind === "stateMachine";
  const patch = (next: AnimatorTransitionPatch) => onChange(patchAnimatorTransition(
    controller,
    layer.id,
    source,
    transition.id,
    next,
  ));
  const sourceLabel = source.kind === "anyState"
    ? "Reaction Router"
    : source.kind === "stateMachine"
      ? findAnimatorStateMachine(layer, source.stateMachineId)?.machine.name ?? "Missing state machine"
      : findAnimatorState(layer, source.stateId)?.state.name ?? "Missing state";
  const destinationLabel = transition.destination.kind === "exit"
    ? sourceScopeIsNested(layer, source) ? "Exit" : "Exit Layer"
    : transition.destination.kind === "stateMachine"
      ? findAnimatorStateMachine(layer, transition.destination.stateMachineId)?.machine.name
        ?? "Missing state machine"
      : findAnimatorState(layer, transition.destination.stateId)?.state.name ?? "Missing state";
  if (layer.syncedLayerId) return (
    <div className={inspectorContentClass}>
      <header className={inspectorTitleClass}>
        <div><small>Transition</small><strong>{sourceLabel} → {destinationLabel}</strong></div>
      </header>
      <section className={inspectorSectionClass}>
        <header><strong>Transition</strong><span>Inherited</span></header>
        <p className={inspectorHelpClass}>
          Timing and conditions are inherited from the source layer.
        </p>
      </section>
    </div>
  );
  return (
    <div className={inspectorContentClass}>
      <header className={inspectorTitleClass}>
        <div><small>Transition</small><strong>{sourceLabel} → {destinationLabel}</strong></div>
        <button type="button" className={inspectorDangerButtonClass} title="Delete transition" onClick={() => {
          onChange(removeAnimatorTransition(controller, layer.id, source, transition.id));
          onDeleted();
        }}><EditorIcon name="delete" size="row-action" /></button>
      </header>
      {isExitRoute ? <section className={inspectorSectionClass}>
        <header><strong>Exit Route</strong></header>
        <p className={inspectorHelpClass}>
          Chooses the next parent node. Timing comes from the transition into Exit.
        </p>
      </section> : <><AnimatorCrossfadeEditor
        transition={transition}
        sourceLabel={sourceLabel}
        destinationLabel={destinationLabel}
        sourceDurationSeconds={transitionSourceDurationSeconds(layer, source, clips)}
        playbackProgress={playbackProgress}
        onChange={patch}
      />
      <section className={inspectorSectionClass}>
        <header><strong>Interruption</strong></header>
        <label>May be interrupted by<select value={transition.interruptionSource} onChange={(event) => patch({ interruptionSource: event.currentTarget.value as AnimatorTransition["interruptionSource"] })}>
          <option value="none">Nothing</option>
          <option value="source">Current state</option>
          <option value="destination">Next state</option>
          <option value="sourceThenDestination">Current, then next</option>
          <option value="destinationThenSource">Next, then current</option>
        </select></label>
        <label className="animator-check"><input type="checkbox" checked={transition.orderedInterruption} disabled={transition.interruptionSource === "none"} onChange={(event) => patch({ orderedInterruption: event.currentTarget.checked })} /> Respect authored transition order</label>
        {source.kind === "anyState" && <label className="animator-check"><input type="checkbox" checked={transition.canTransitionToSelf} onChange={(event) => patch({ canTransitionToSelf: event.currentTarget.checked })} /> Allow self transition</label>}
      </section></>}
      <AnimatorConditionList parameters={controller.parameters} conditions={transition.conditions} onChange={(conditions) => patch({ conditions })} />
    </div>
  );
}

function transitionFor(layer: AnimatorLayer, source: AnimatorTransitionSource, id: string) {
  if (source.kind === "anyState") {
    const transitions = source.stateMachineId
      ? findAnimatorStateMachine(layer, source.stateMachineId)?.machine.anyStateTransitions
      : layer.anyStateTransitions;
    return transitions?.find((transition) => transition.id === id);
  }
  if (source.kind === "stateMachine") {
    return findAnimatorStateMachine(layer, source.stateMachineId)?.machine.transitions
      .find((transition) => transition.id === id);
  }
  return findAnimatorState(layer, source.stateId)?.state.transitions
    .find((transition) => transition.id === id);
}

function transitionSourceDurationSeconds(
  layer: AnimatorLayer,
  source: AnimatorTransitionSource,
  clips: readonly ImportedCharacterAssetOption[],
): number | undefined {
  if (source.kind !== "state") return undefined;
  const motion = findAnimatorState(layer, source.stateId)?.state.motion;
  if (motion?.kind !== "clip") return undefined;
  const duration = clips.find((clip) => (
    characterAssetOptionKey(clip.ref) === characterAssetOptionKey(motion.clipRef)
  ))?.durationSeconds;
  if (duration === undefined) return undefined;
  const speed = Number.isFinite(motion.speed) && motion.speed !== 0 ? Math.abs(motion.speed) : 1;
  return duration / speed;
}

function sourceScopeIsNested(layer: AnimatorLayer, source: AnimatorTransitionSource): boolean {
  if (source.kind === "anyState") return Boolean(source.stateMachineId);
  if (source.kind === "state") return Boolean(findAnimatorState(layer, source.stateId)?.ownerMachineId);
  const location = findAnimatorStateMachine(layer, source.stateMachineId);
  return Boolean(location && location.parent !== layer);
}
