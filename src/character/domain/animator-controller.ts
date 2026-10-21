import type { AssetRef } from "../../assets/domain/asset-reference";
import type { AnimationEventPayload } from "./animation-clip";
import type { AnimatorMotion } from "./blend-tree";
import type { AnimatorCondition, AnimatorParameter } from "./animator-parameters";
import type { CharacterDocumentExtensions } from "./character-document";
import type { AnimatorBehaviorMap } from "./animator-behavior-map";

export type AnimatorStateEvent = {
  id: string;
  name: string;
  timeNormalized: number;
  payload: AnimationEventPayload;
};

export type AnimatorTransitionDestination =
  | { kind: "state"; stateId: string }
  | { kind: "stateMachine"; stateMachineId: string }
  | { kind: "exit" };

export type AnimatorTransition = {
  id: string;
  destination: AnimatorTransitionDestination;
  conditions: AnimatorCondition[];
  hasExitTime: boolean;
  exitTimeNormalized: number;
  durationMode: "seconds" | "normalized";
  duration: number;
  offsetNormalized: number;
  interruptionSource: "none" | "source" | "destination" | "sourceThenDestination" | "destinationThenSource";
  orderedInterruption: boolean;
  canTransitionToSelf: boolean;
};

export type AnimatorState = {
  id: string;
  name: string;
  motion: AnimatorMotion | null;
  speed: number;
  speedParameterId?: string;
  cycleOffset: number;
  cycleOffsetParameterId?: string;
  mirror: boolean;
  footIk: boolean;
  writeDefaults: boolean;
  transitions: AnimatorTransition[];
  events: AnimatorStateEvent[];
};

export function createAnimatorState(id: string, name: string): AnimatorState {
  return {
    id,
    name,
    motion: null,
    speed: 1,
    cycleOffset: 0,
    mirror: false,
    footIk: false,
    writeDefaults: true,
    transitions: [],
    events: [],
  };
}

/**
 * A semantic child state machine. Its states and child machines are evaluated
 * internally; `transitions` route its Exit node in the parent graph.
 *
 * `defaultStateId` retains the legacy field name, but may identify either a
 * direct state or a direct child state machine. Direct node IDs must therefore
 * be unique within this machine.
 */
export type AnimatorStateMachine = {
  id: string;
  name: string;
  defaultStateId: string;
  states: AnimatorState[];
  stateMachines: AnimatorStateMachine[];
  anyStateTransitions: AnimatorTransition[];
  transitions: AnimatorTransition[];
};

export type AnimatorLayer = {
  id: string;
  name: string;
  weight: number;
  blendingMode: "override" | "additive";
  avatarMaskRef?: AssetRef;
  ikPass: boolean;
  syncedLayerId?: string;
  /** When true, this layer's motion duration contributes to synchronized-state timing. */
  syncedLayerAffectsTiming?: boolean;
  defaultStateId: string;
  states: AnimatorState[];
  anyStateTransitions: AnimatorTransition[];
  /** Optional for compatibility with flat v1 controller documents. */
  stateMachines?: AnimatorStateMachine[];
};

export type AnimatorController = {
  version: 1;
  id: string;
  name: string;
  revision?: string;
  sourceRef?: AssetRef;
  parameters: AnimatorParameter[];
  layers: AnimatorLayer[];
  /** Authoring-only graph layout. Runtime state-machine semantics remain on layers. */
  behaviorMap?: AnimatorBehaviorMap;
  extensions?: CharacterDocumentExtensions;
};

/** Creates the smallest valid controller document for an authoring workflow. */
export function createAnimatorController(id: string, name = "Animator Controller"): AnimatorController {
  return {
    version: 1,
    id,
    name,
    parameters: [],
    layers: [{
      id: "base-layer",
      name: "Base Layer",
      weight: 1,
      blendingMode: "override",
      ikPass: false,
      defaultStateId: "",
      states: [],
      anyStateTransitions: [],
    }],
  };
}
