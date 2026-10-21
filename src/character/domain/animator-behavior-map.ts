import type { CharacterVector2 } from "./character-values";

export const ANIMATOR_GRAPH_NODE_IDS = {
  entry: "entry",
  anyState: "any-state",
  exit: "exit",
} as const;

export type AnimatorGraphNodeLayout = {
  id: string;
  position: CharacterVector2;
  /** Undefined identifies the root state machine of the layer. */
  stateMachineId?: string;
};

export type AnimatorLayerBehaviorMap = {
  layerId: string;
  nodes: AnimatorGraphNodeLayout[];
};

/** Persisted graph layout only. Runtime state-machine semantics live on the layer. */
export type AnimatorBehaviorMap = {
  version: 1;
  layers: AnimatorLayerBehaviorMap[];
};

export function animatorStateNodeId(stateId: string): string {
  return `state:${stateId}`;
}

export function animatorStateMachineNodeId(stateMachineId: string): string {
  return `state-machine:${stateMachineId}`;
}

export function emptyAnimatorBehaviorMap(): AnimatorBehaviorMap {
  return { version: 1, layers: [] };
}
