import type { AnimatorTransitionSource } from "../../application/animator-transition-authoring";
import { canAddAnimatorTransition } from "../../application/animator-controller-authoring-limits";
import type { AnimatorController, AnimatorLayer } from "../../domain/animator-controller";
import type { AnimatorGraphNode } from "../../application/animator-graph-model";
import {
  animatorStateMachineScope,
  childAnimatorStateMachines,
} from "../../domain/animator-state-machine";
import type { AnimatorGraphPoint } from "./animator-graph-viewport";

export type AnimatorGraphConnectionSource = AnimatorTransitionSource | { kind: "entry" };

export type AnimatorGraphConnectionPreview = Readonly<{
  sourceNodeId: string;
  pointer: AnimatorGraphPoint;
  destinationNodeId?: string;
  status: "free" | "valid" | "invalid";
}>;

export function canBeginAnimatorGraphConnection(
  layer: AnimatorLayer,
  source: AnimatorGraphConnectionSource,
  stateMachineId?: string,
): boolean {
  if (layer.syncedLayerId) return false;
  const scope = animatorStateMachineScope(layer, stateMachineId);
  if (!scope) return false;
  const hasNodes = scope.states.length + childAnimatorStateMachines(scope).length > 0;
  if (source.kind === "entry") return hasNodes;
  if (source.kind === "state"
    && !scope.states.some((state) => state.id === source.stateId)) return false;
  if (source.kind === "stateMachine"
    && !childAnimatorStateMachines(scope).some((machine) => machine.id === source.stateMachineId)) return false;
  if (source.kind === "anyState" && (!hasNodes || source.stateMachineId !== stateMachineId)) return false;
  return canAddAnimatorTransition(layer, source.kind, stateMachineId);
}

/** Keeps visible port eligibility and authored completion on one shared rule. */
export function canCompleteAnimatorGraphConnection(
  controller: AnimatorController,
  layer: AnimatorLayer,
  source: AnimatorGraphConnectionSource,
  destination: AnimatorGraphNode,
  stateMachineId?: string,
): boolean {
  if (!canBeginAnimatorGraphConnection(layer, source, stateMachineId)) return false;
  if (source.kind === "entry") {
    return destination.kind === "state" || destination.kind === "stateMachine";
  }
  if (destination.kind === "state") {
    return source.kind !== "state" || source.stateId !== destination.stateId;
  }
  if (destination.kind === "stateMachine") {
    return source.kind !== "stateMachine"
      || source.stateMachineId !== destination.stateMachineId;
  }
  return destination.kind === "exit"
    && (Boolean(stateMachineId) || controller.layers[0]?.id !== layer.id);
}

export function animatorGraphConnectionSource(
  node: AnimatorGraphNode,
  stateMachineId?: string,
): AnimatorGraphConnectionSource | null {
  if (node.kind === "entry") return { kind: "entry" };
  if (node.kind === "anyState") return {
    kind: "anyState",
    ...(stateMachineId ? { stateMachineId } : {}),
  };
  if (node.kind === "state") return { kind: "state", stateId: node.stateId! };
  if (node.kind === "stateMachine") return {
    kind: "stateMachine",
    stateMachineId: node.stateMachineId!,
  };
  return null;
}

export function sameAnimatorGraphConnectionSource(
  left: AnimatorGraphConnectionSource,
  right: AnimatorGraphConnectionSource,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "state" && right.kind === "state") return left.stateId === right.stateId;
  if (left.kind === "stateMachine" && right.kind === "stateMachine") {
    return left.stateMachineId === right.stateMachineId;
  }
  if (left.kind === "anyState" && right.kind === "anyState") {
    return left.stateMachineId === right.stateMachineId;
  }
  return left.kind === "entry" && right.kind === "entry";
}
