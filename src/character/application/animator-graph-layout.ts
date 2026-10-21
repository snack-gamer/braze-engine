import {
  ANIMATOR_GRAPH_NODE_IDS,
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../domain/animator-behavior-map";
import type { AnimatorController, AnimatorLayer } from "../domain/animator-controller";
import type { CharacterVector2 } from "../domain/character-values";
import { animatorStateMachineScope, childAnimatorStateMachines } from "../domain/animator-state-machine";
import { setAnimatorGraphNodePosition } from "./animator-behavior-map-authoring";

const STATE_COLUMNS = 3;
const STATE_COLUMN_GAP = 230;
const STATE_ROW_GAP = 150;
const STATE_ORIGIN: CharacterVector2 = [330, 90];

export const ANIMATOR_GRAPH_FIXED_POSITIONS = {
  entry: [72, 120],
  anyState: [72, 260],
} as const satisfies Readonly<Record<"entry" | "anyState", CharacterVector2>>;

export function defaultAnimatorStateGraphPosition(index: number): CharacterVector2 {
  return [
    STATE_ORIGIN[0] + (index % STATE_COLUMNS) * STATE_COLUMN_GAP,
    STATE_ORIGIN[1] + Math.floor(index / STATE_COLUMNS) * STATE_ROW_GAP,
  ];
}

export function defaultAnimatorExitGraphPosition(stateCount: number): CharacterVector2 {
  const occupiedColumns = Math.min(STATE_COLUMNS, Math.max(1, stateCount));
  return [STATE_ORIGIN[0] + occupiedColumns * STATE_COLUMN_GAP, 120];
}

export function autoArrangeAnimatorGraph(
  controller: AnimatorController,
  layer: AnimatorLayer,
  stateMachineId?: string,
): AnimatorController {
  const scope = animatorStateMachineScope(layer, stateMachineId);
  if (!scope) return controller;
  const childMachines = childAnimatorStateMachines(scope);
  const contentCount = scope.states.length + childMachines.length;
  let next = controller;
  next = setAnimatorGraphNodePosition(
    next,
    layer.id,
    ANIMATOR_GRAPH_NODE_IDS.entry,
    ANIMATOR_GRAPH_FIXED_POSITIONS.entry,
    stateMachineId,
  );
  next = setAnimatorGraphNodePosition(
    next,
    layer.id,
    ANIMATOR_GRAPH_NODE_IDS.anyState,
    ANIMATOR_GRAPH_FIXED_POSITIONS.anyState,
    stateMachineId,
  );
  next = setAnimatorGraphNodePosition(
    next,
    layer.id,
    ANIMATOR_GRAPH_NODE_IDS.exit,
    defaultAnimatorExitGraphPosition(contentCount),
    stateMachineId,
  );
  scope.states.forEach((state, index) => {
    next = setAnimatorGraphNodePosition(
      next,
      layer.id,
      animatorStateNodeId(state.id),
      defaultAnimatorStateGraphPosition(index),
      stateMachineId,
    );
  });
  childMachines.forEach((machine, index) => {
    next = setAnimatorGraphNodePosition(
      next,
      layer.id,
      animatorStateMachineNodeId(machine.id),
      defaultAnimatorStateGraphPosition(scope.states.length + index),
      stateMachineId,
    );
  });
  return next;
}
