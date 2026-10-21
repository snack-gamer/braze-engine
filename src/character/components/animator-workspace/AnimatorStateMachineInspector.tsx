import { EditorIcon } from "../../../ui/EditorIcon";
import {
  patchAnimatorStateMachine,
  removeAnimatorStateMachine,
} from "../../application/animator-state-machine-authoring";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import {
  findAnimatorState,
  findAnimatorStateMachine,
} from "../../domain/animator-state-machine";
import { CommittedTextInput } from "../CommittedTextInput";
import {
  inspectorContentClass,
  inspectorDangerButtonClass,
  inspectorHelpClass,
  inspectorSectionClass,
  inspectorTitleClass,
} from "./animator-inspector-classes";

type AnimatorStateMachineInspectorProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateMachineId: string;
  onChange: (controller: AnimatorController) => void;
  onDeleted: () => void;
  onOpen: () => void;
  onSelectReaction: (transitionId: string) => void;
  onSelectExitRoute: (transitionId: string) => void;
  canDelete?: boolean;
  canOpen?: boolean;
}>;

/** Edits the parent-graph representation of one nested state machine. */
export function AnimatorStateMachineInspector({
  controller,
  layer,
  stateMachineId,
  onChange,
  onDeleted,
  onOpen,
  onSelectReaction,
  onSelectExitRoute,
  canDelete = true,
  canOpen = true,
}: AnimatorStateMachineInspectorProps) {
  const machine = findAnimatorStateMachine(layer, stateMachineId)?.machine;
  if (!machine) return null;
  const inheritsStructure = Boolean(layer.syncedLayerId);
  return (
    <div className={inspectorContentClass}>
      <header className={inspectorTitleClass}>
        <div><small>Nested State Machine</small>{inheritsStructure
          ? <strong>{machine.name}</strong>
          : <CommittedTextInput
              value={machine.name}
              ariaLabel="State machine name"
              onCommit={(name) => onChange(patchAnimatorStateMachine(
                controller,
                layer.id,
                machine.id,
                { name },
              ))}
            />}</div>
        {canDelete && !inheritsStructure && <button
          type="button"
          className={inspectorDangerButtonClass}
          title="Delete state machine"
          onClick={() => {
            onChange(removeAnimatorStateMachine(controller, layer.id, machine.id));
            onDeleted();
          }}
        ><EditorIcon name="delete" size="row-action" /></button>}
      </header>
      <section className={inspectorSectionClass}>
        <header><strong>Contents</strong><span>
          States {machine.states.length} · Nested {machine.stateMachines.length}
        </span></header>
        <p className={inspectorHelpClass}>
          Uses shared Controller parameters. Edit Entry, Exit, and transitions inside.{inheritsStructure
            ? " Structure is inherited from the source layer."
            : ""}
        </p>
        {canOpen && <button type="button" className="ghost-button" onClick={onOpen}>
          Open State Machine
        </button>}
      </section>
      {inheritsStructure ? <section className={inspectorSectionClass}>
        <header><strong>Transitions</strong><span>Inherited</span></header>
        <p className={inspectorHelpClass}>
          Inherited from the source layer.
        </p>
      </section> : <>
        <TransitionList
          title="Internal reactions"
          empty="Connect the Reaction Router here."
          transitions={machine.anyStateTransitions}
          layer={layer}
          onSelect={onSelectReaction}
        />
        <TransitionList
          title="Exit routes"
          empty="Connect this node in its parent graph."
          transitions={machine.transitions}
          layer={layer}
          onSelect={onSelectExitRoute}
        />
      </>}
    </div>
  );
}

function TransitionList({
  title,
  empty,
  transitions,
  layer,
  onSelect,
}: Readonly<{
  title: string;
  empty: string;
  transitions: AnimatorLayer["anyStateTransitions"];
  layer: AnimatorLayer;
  onSelect: (transitionId: string) => void;
}>) {
  return <section className={inspectorSectionClass}>
    <header><strong>{title}</strong><span>{transitions.length}</span></header>
    {transitions.map((transition) => <button
      type="button"
      key={transition.id}
      className="animator-edge-row"
      onClick={() => onSelect(transition.id)}
    >
      <span>→ {destinationName(layer, transition)}</span>
      <small>{transition.conditions.length} conditions</small>
    </button>)}
    {transitions.length === 0 && <p className="animator-inspector-empty">{empty}</p>}
  </section>;
}

function destinationName(
  layer: AnimatorLayer,
  transition: AnimatorLayer["anyStateTransitions"][number],
): string {
  if (transition.destination.kind === "exit") return "Exit";
  if (transition.destination.kind === "stateMachine") {
    return findAnimatorStateMachine(layer, transition.destination.stateMachineId)?.machine.name
      ?? "Missing state machine";
  }
  return findAnimatorState(layer, transition.destination.stateId)?.state.name ?? "Missing state";
}
