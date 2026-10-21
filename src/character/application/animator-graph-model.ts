import {
  ANIMATOR_GRAPH_NODE_IDS,
  animatorStateMachineNodeId,
  animatorStateNodeId,
} from "../domain/animator-behavior-map";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorTransition,
} from "../domain/animator-controller";
import type { CharacterVector2 } from "../domain/character-values";
import {
  animatorStateMachineScope,
  childAnimatorStateMachines,
} from "../domain/animator-state-machine";
import { resolveAnimatorTransitionLayer } from "../domain/animator-synchronized-layer";
import { animatorLayerBehaviorMap } from "./animator-behavior-map-authoring";
import {
  ANIMATOR_GRAPH_FIXED_POSITIONS,
  defaultAnimatorExitGraphPosition,
  defaultAnimatorStateGraphPosition,
} from "./animator-graph-layout";
import type { AnimatorTransitionSource } from "./animator-transition-authoring";

export const ANIMATOR_GRAPH_NODE_SIZE = { width: 184, height: 64 } as const;
export const ANIMATOR_GRAPH_TERMINAL_NODE_SIZE = { width: 184, height: 48 } as const;

export type AnimatorGraphNode = Readonly<{
  id: string;
  kind: "entry" | "anyState" | "exit" | "state" | "stateMachine";
  motionKind?: "clip" | "blendTree1d" | "blendTree2d" | "blendTreeDirect";
  label: string;
  subtitle: string;
  x: number;
  y: number;
  stateId?: string;
  stateMachineId?: string;
  previewWeight?: number;
  defaultState: boolean;
}>;

export type AnimatorGraphEdge = Readonly<{
  id: string;
  kind: "entry" | "transition";
  sourceNodeId: string;
  destinationNodeId: string;
  source?: AnimatorTransitionSource;
  transition?: AnimatorTransition;
}>;

export type AnimatorGraphModel = Readonly<{
  nodes: readonly AnimatorGraphNode[];
  edges: readonly AnimatorGraphEdge[];
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  extent: Readonly<{ width: number; height: number }>;
}>;

export function animatorGraphNodeSize(node: Pick<AnimatorGraphNode, "kind">) {
  return node.kind === "entry" || node.kind === "exit"
    ? ANIMATOR_GRAPH_TERMINAL_NODE_SIZE
    : ANIMATOR_GRAPH_NODE_SIZE;
}

export function buildAnimatorGraphModel(
  controller: AnimatorController,
  layer: AnimatorLayer,
  stateMachineId?: string,
): AnimatorGraphModel {
  const scope = animatorStateMachineScope(layer, stateMachineId);
  if (!scope) return emptyAnimatorGraphModel();
  const transitionScope = animatorStateMachineScope(
    resolveAnimatorTransitionLayer(controller, layer),
    stateMachineId,
  ) ?? scope;
  const authored = animatorLayerBehaviorMap(controller, layer.id);
  const positions = new Map(authored.nodes
    .filter((node) => node.stateMachineId === stateMachineId)
    .map((node) => [node.id, node.position]));
  const childMachines = childAnimatorStateMachines(scope);
  const contentCount = scope.states.length + childMachines.length;
  const fixed: AnimatorGraphNode[] = [
    graphNode(ANIMATOR_GRAPH_NODE_IDS.entry, "entry", "Entry", positions, ANIMATOR_GRAPH_FIXED_POSITIONS.entry),
    graphNode(
      ANIMATOR_GRAPH_NODE_IDS.anyState,
      "anyState",
      "Reaction Router",
      positions,
      ANIMATOR_GRAPH_FIXED_POSITIONS.anyState,
      stateMachineId ? "Scoped reactions" : "Global reactions",
    ),
    graphNode(
      ANIMATOR_GRAPH_NODE_IDS.exit,
      "exit",
      stateMachineId ? "Exit" : "Exit Layer",
      positions,
      defaultAnimatorExitGraphPosition(contentCount),
    ),
  ];
  const states = scope.states.map((state, index): AnimatorGraphNode => {
    const id = animatorStateNodeId(state.id);
    const position = positions.get(id) ?? defaultAnimatorStateGraphPosition(index);
    return {
      id,
      kind: "state",
      motionKind: animatorGraphMotionKind(state.motion),
      label: state.name,
      subtitle: motionLabel(state.motion),
      x: position[0],
      y: position[1],
      stateId: state.id,
      defaultState: scope.defaultStateId === state.id,
    };
  });
  const machines = childMachines.map((machine, index): AnimatorGraphNode => {
    const id = animatorStateMachineNodeId(machine.id);
    const position = positions.get(id)
      ?? defaultAnimatorStateGraphPosition(scope.states.length + index);
    return {
      id,
      kind: "stateMachine",
      label: machine.name,
      subtitle: "State Machine",
      x: position[0],
      y: position[1],
      stateMachineId: machine.id,
      defaultState: scope.defaultStateId === machine.id,
    };
  });
  const nodes = [...fixed, ...states, ...machines];
  const edges: AnimatorGraphEdge[] = [];
  if (scope.defaultStateId) edges.push({
    id: `entry:${scope.defaultStateId}`,
    kind: "entry",
    sourceNodeId: ANIMATOR_GRAPH_NODE_IDS.entry,
    destinationNodeId: childMachines.some((machine) => machine.id === scope.defaultStateId)
      ? animatorStateMachineNodeId(scope.defaultStateId)
      : animatorStateNodeId(scope.defaultStateId),
  });
  for (const transition of transitionScope.anyStateTransitions) edges.push(transitionEdge(
    transition,
    { kind: "anyState", ...(stateMachineId ? { stateMachineId } : {}) },
    ANIMATOR_GRAPH_NODE_IDS.anyState,
  ));
  for (const state of transitionScope.states) {
    for (const transition of state.transitions) edges.push(transitionEdge(
      transition,
      { kind: "state", stateId: state.id },
      animatorStateNodeId(state.id),
    ));
  }
  for (const machine of childAnimatorStateMachines(transitionScope)) {
    for (const transition of machine.transitions) edges.push(transitionEdge(
      transition,
      { kind: "stateMachine", stateMachineId: machine.id },
      animatorStateMachineNodeId(machine.id),
    ));
  }
  const left = Math.min(...nodes.map((node) => node.x));
  const top = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + animatorGraphNodeSize(node).width));
  const bottom = Math.max(...nodes.map((node) => node.y + animatorGraphNodeSize(node).height));
  return {
    nodes,
    edges,
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    extent: { width: Math.max(1, right), height: Math.max(1, bottom) },
  };
}

function emptyAnimatorGraphModel(): AnimatorGraphModel {
  return {
    nodes: [],
    edges: [],
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    extent: { width: 1, height: 1 },
  };
}

function graphNode(
  id: string,
  kind: AnimatorGraphNode["kind"],
  label: string,
  positions: ReadonlyMap<string, readonly [number, number]>,
  fallback: CharacterVector2,
  subtitle?: string,
): AnimatorGraphNode {
  const position = positions.get(id) ?? fallback;
  return {
    id,
    kind,
    label,
    subtitle: subtitle ?? kind,
    x: position[0],
    y: position[1],
    defaultState: false,
  };
}

function motionLabel(motion: AnimatorLayer["states"][number]["motion"]): string {
  if (!motion) return "No motion";
  if (motion.kind === "clip") return "Clip";
  return "Blend Tree";
}

export function animatorGraphMotionKind(
  motion: AnimatorLayer["states"][number]["motion"],
): AnimatorGraphNode["motionKind"] {
  if (!motion) return undefined;
  if (motion.kind === "clip") return "clip";
  if (motion.tree.kind === "1d") return "blendTree1d";
  if (motion.tree.kind === "direct") return "blendTreeDirect";
  return "blendTree2d";
}

function transitionEdge(
  transition: AnimatorTransition,
  source: AnimatorTransitionSource,
  sourceNodeId: string,
): AnimatorGraphEdge {
  return {
    id: transition.id,
    kind: "transition",
    sourceNodeId,
    destinationNodeId: transition.destination.kind === "exit"
      ? ANIMATOR_GRAPH_NODE_IDS.exit
      : transition.destination.kind === "stateMachine"
        ? animatorStateMachineNodeId(transition.destination.stateMachineId)
        : animatorStateNodeId(transition.destination.stateId),
    source,
    transition,
  };
}
