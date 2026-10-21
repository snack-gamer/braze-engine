import { EditorIcon } from "../../../ui/EditorIcon";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorStateMachine,
} from "../../domain/animator-controller";
import { CommittedTextInput } from "../CommittedTextInput";

type AnimatorWorkspaceToolbarProps = Readonly<{
  controller: AnimatorController;
  layer: AnimatorLayer;
  stateMachinePath: readonly AnimatorStateMachine[];
  blendTreeName?: string;
  onChange: (controller: AnimatorController) => void;
  onNavigateStateMachine: (stateMachineId?: string) => void;
}>;

export function AnimatorWorkspaceToolbar({
  controller,
  layer,
  stateMachinePath,
  blendTreeName,
  onChange,
  onNavigateStateMachine,
}: AnimatorWorkspaceToolbarProps) {
  const scope = stateMachinePath[stateMachinePath.length - 1] ?? layer;
  const transitionCount = scope.anyStateTransitions.length
    + scope.states.reduce((total, state) => total + state.transitions.length, 0)
    + (scope.stateMachines ?? []).reduce((total, machine) => total + machine.transitions.length, 0);
  const nestedMachineCount = scope.stateMachines?.length ?? 0;
  return (
    <header className="animator-workspace__toolbar">
      <EditorIcon name="animator" size="row-action" />
      <CommittedTextInput
        className="animator-workspace__name"
        value={controller.name}
        ariaLabel="Animator Controller name"
        onCommit={(name) => onChange({ ...controller, name })}
      />
      <div className="animator-workspace__layer-context">
        <nav aria-label="Animator state machine path">
          <button
            type="button"
            aria-current={stateMachinePath.length === 0 && !blendTreeName ? "page" : undefined}
            onClick={() => onNavigateStateMachine()}
          >{layer.name}</button>
          {stateMachinePath.map((machine, index) => <span key={machine.id}>
            <i aria-hidden="true">›</i>
            <button
              type="button"
              aria-current={index === stateMachinePath.length - 1 && !blendTreeName ? "page" : undefined}
              onClick={() => onNavigateStateMachine(machine.id)}
            >{machine.name}</button>
          </span>)}
          {blendTreeName && <span><i aria-hidden="true">›</i><button type="button" aria-current="page">
            {blendTreeName}
          </button></span>}
        </nav>
        <span>
          {countLabel(scope.states.length, "state")} · {countLabel(nestedMachineCount, "nested machine")}
          {" · "}{countLabel(transitionCount, "transition")}
        </span>
      </div>
      <div className="animator-workspace__toolbar-spacer" />
    </header>
  );
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
