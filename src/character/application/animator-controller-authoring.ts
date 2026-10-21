import type { AssetRef } from "../../assets/domain/asset-reference";
import { createAuthoredId } from "../../identity/authored-id";
import type {
  AnimatorController,
  AnimatorLayer,
  AnimatorState,
  AnimatorStateMachine,
  AnimatorTransition,
} from "../domain/animator-controller";
import { createAnimatorState } from "../domain/animator-controller";
import type { AnimatorParameter } from "../domain/animator-parameters";
import type { AnimatorMotion } from "../domain/blend-tree";
import {
  animatorStateMachinesInLayer,
  animatorStatesInLayer,
} from "../domain/animator-state-machine";
import {
  canAddAnimatorLayer,
  canAddAnimatorParameter,
  canAddAnimatorState,
  MAX_AUTHORED_ANIMATOR_LAYERS,
  MAX_AUTHORED_ANIMATOR_PARAMETERS,
  MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER,
  MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER,
} from "./animator-controller-authoring-limits";
import {
  pruneAnimatorLayerBehaviorStateReferences,
  reconcileAnimatorSynchronizedLayers,
  synchronizeAnimatorLayerStateMachine,
} from "./animator-synchronized-layer-authoring";

export type AnimatorParameterKind = AnimatorParameter["kind"];

export class AnimatorAuthoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnimatorAuthoringError";
  }
}

function authoredName(value: string, label: string): string {
  const name = value.trim();
  if (!name) throw new AnimatorAuthoringError(`${label} name cannot be empty.`);
  return name;
}

function updateLayer(
  controller: AnimatorController,
  layerId: string,
  update: (layer: AnimatorLayer) => AnimatorLayer,
): AnimatorController {
  let found = false;
  const layers = controller.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    found = true;
    return update(layer);
  });
  if (!found) throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  return { ...controller, layers };
}

function updateState(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  update: (state: AnimatorState, layer: AnimatorLayer) => AnimatorState,
): AnimatorController {
  return updateLayer(controller, layerId, (layer) => {
    let found = false;
    const states = layer.states.map((state) => {
      if (state.id !== stateId) return state;
      found = true;
      return update(state, layer);
    });
    if (!found) throw new AnimatorAuthoringError(`Animator state '${stateId}' was not found.`);
    return { ...layer, states };
  });
}

function defaultParameter(kind: AnimatorParameterKind, id: string, name: string): AnimatorParameter {
  if (kind === "float") return { id, name, kind, defaultValue: 0 };
  if (kind === "integer") return { id, name, kind, defaultValue: 0 };
  if (kind === "boolean") return { id, name, kind, defaultValue: false };
  return { id, name, kind, defaultValue: false };
}

export function addAnimatorParameter(
  controller: AnimatorController,
  kind: AnimatorParameterKind,
  options: { id?: string; name?: string } = {},
): AnimatorController {
  if (!canAddAnimatorParameter(controller)) {
    throw new AnimatorAuthoringError(`An Animator Controller cannot exceed ${MAX_AUTHORED_ANIMATOR_PARAMETERS} parameters.`);
  }
  const id = options.id ?? createAuthoredId("animator-parameter");
  if (controller.parameters.some((parameter) => parameter.id === id)) {
    throw new AnimatorAuthoringError(`Animator parameter '${id}' already exists.`);
  }
  const name = authoredName(options.name ?? `New ${kind}`, "Parameter");
  return { ...controller, parameters: [...controller.parameters, defaultParameter(kind, id, name)] };
}

export function patchAnimatorParameter(
  controller: AnimatorController,
  parameterId: string,
  patch: { name?: string; defaultValue?: number | boolean },
): AnimatorController {
  let found = false;
  const parameters = controller.parameters.map((parameter): AnimatorParameter => {
    if (parameter.id !== parameterId) return parameter;
    found = true;
    const name = patch.name === undefined ? parameter.name : authoredName(patch.name, "Parameter");
    if (parameter.kind === "boolean") {
      return { ...parameter, name, defaultValue: patch.defaultValue === undefined
        ? parameter.defaultValue
        : patch.defaultValue === true };
    }
    if (parameter.kind === "trigger") return { ...parameter, name, defaultValue: false };
    const value = typeof patch.defaultValue === "number" && Number.isFinite(patch.defaultValue)
      ? patch.defaultValue
      : parameter.defaultValue;
    return { ...parameter, name, defaultValue: parameter.kind === "integer" ? Math.round(value) : value };
  });
  if (!found) throw new AnimatorAuthoringError(`Animator parameter '${parameterId}' was not found.`);
  return { ...controller, parameters };
}

function stripParameterFromMotion(motion: AnimatorMotion | null, parameterId: string): AnimatorMotion | null {
  if (!motion) return null;
  if (motion.kind === "clip") {
    if (motion.timeScaleParameterId !== parameterId) return motion;
    const { timeScaleParameterId: _removed, ...clip } = motion;
    return clip;
  }
  const tree = motion.tree;
  if (tree.kind === "1d" && tree.parameterId === parameterId) return null;
  if (tree.kind === "direct") {
    const children = tree.children.flatMap((child) => {
      if (child.weightParameterId === parameterId) return [];
      const childMotion = stripParameterFromMotion(child.motion, parameterId);
      return childMotion ? [{ ...child, motion: childMotion }] : [];
    });
    return { kind: "blendTree", tree: { ...tree, children } };
  }
  if (tree.kind !== "1d"
    && (tree.parameterXId === parameterId || tree.parameterYId === parameterId)) return null;
  const children = tree.children.flatMap((child) => {
    const childMotion = stripParameterFromMotion(child.motion, parameterId);
    return childMotion ? [{ ...child, motion: childMotion }] : [];
  });
  return { kind: "blendTree", tree: { ...tree, children } } as AnimatorMotion;
}

export function removeAnimatorParameter(
  controller: AnimatorController,
  parameterId: string,
): AnimatorController {
  if (!controller.parameters.some((parameter) => parameter.id === parameterId)) {
    throw new AnimatorAuthoringError(`Animator parameter '${parameterId}' was not found.`);
  }
  return {
    ...controller,
    parameters: controller.parameters.filter((parameter) => parameter.id !== parameterId),
    layers: controller.layers.map((layer) => ({
      ...layer,
      states: layer.states.map((state) => stripParameterFromState(state, parameterId)),
      stateMachines: layer.stateMachines?.map((machine) => stripParameterFromMachine(
        machine,
        parameterId,
      )),
      anyStateTransitions: stripParameterFromTransitions(layer.anyStateTransitions, parameterId),
    })),
  };
}

function stripParameterFromState(state: AnimatorState, parameterId: string): AnimatorState {
  return {
    ...state,
    ...(state.speedParameterId === parameterId ? { speedParameterId: undefined } : {}),
    ...(state.cycleOffsetParameterId === parameterId ? { cycleOffsetParameterId: undefined } : {}),
    motion: stripParameterFromMotion(state.motion, parameterId),
    transitions: stripParameterFromTransitions(state.transitions, parameterId),
  };
}

function stripParameterFromMachine(
  machine: AnimatorStateMachine,
  parameterId: string,
): AnimatorStateMachine {
  return {
    ...machine,
    states: machine.states.map((state) => stripParameterFromState(state, parameterId)),
    stateMachines: machine.stateMachines.map((child) => stripParameterFromMachine(child, parameterId)),
    anyStateTransitions: stripParameterFromTransitions(machine.anyStateTransitions, parameterId),
    transitions: stripParameterFromTransitions(machine.transitions, parameterId),
  };
}

function stripParameterFromTransitions(
  transitions: readonly AnimatorTransition[],
  parameterId: string,
): AnimatorTransition[] {
  return transitions.map((transition) => ({
    ...transition,
    conditions: transition.conditions.filter((condition) => condition.parameterId !== parameterId),
  }));
}

export function addAnimatorLayer(
  controller: AnimatorController,
  options: { id?: string; name?: string } = {},
): AnimatorController {
  if (!canAddAnimatorLayer(controller)) {
    throw new AnimatorAuthoringError(`An Animator Controller cannot exceed ${MAX_AUTHORED_ANIMATOR_LAYERS} layers.`);
  }
  const id = options.id ?? createAuthoredId("animator-layer");
  if (controller.layers.some((layer) => layer.id === id)) {
    throw new AnimatorAuthoringError(`Animator layer '${id}' already exists.`);
  }
  const layer: AnimatorLayer = {
    id,
    name: authoredName(options.name ?? `Layer ${controller.layers.length + 1}`, "Layer"),
    weight: controller.layers.length === 0 ? 1 : 0,
    blendingMode: "override",
    ikPass: false,
    defaultStateId: "",
    states: [],
    anyStateTransitions: [],
  };
  return { ...controller, layers: [...controller.layers, layer] };
}

export function patchAnimatorLayer(
  controller: AnimatorController,
  layerId: string,
  patch: Partial<Pick<AnimatorLayer,
    | "name"
    | "weight"
    | "blendingMode"
    | "avatarMaskRef"
    | "ikPass">>,
): AnimatorController {
  return updateLayer(controller, layerId, (layer) => ({
    ...layer,
    ...patch,
    ...(patch.name === undefined ? {} : { name: authoredName(patch.name, "Layer") }),
    ...(patch.weight === undefined
      ? {}
      : { weight: Number.isFinite(patch.weight) ? Math.min(1, Math.max(0, patch.weight)) : layer.weight }),
  }));
}

/** Links a layer to a source state machine while retaining per-state motion overrides. */
export function setAnimatorLayerSynchronization(
  controller: AnimatorController,
  layerId: string,
  sourceLayerId: string | undefined,
  affectsTiming = false,
): AnimatorController {
  if (!sourceLayerId) return updateLayer(controller, layerId, (layer) => ({
    ...layer,
    syncedLayerId: undefined,
    syncedLayerAffectsTiming: false,
  }));
  if (controller.layers[0]?.id === layerId) {
    throw new AnimatorAuthoringError("The base Animator layer cannot synchronize with another layer.");
  }
  if (sourceLayerId === layerId) throw new AnimatorAuthoringError("A layer cannot synchronize with itself.");
  const source = controller.layers.find((layer) => layer.id === sourceLayerId);
  if (!source) throw new AnimatorAuthoringError(`Animator layer '${sourceLayerId}' was not found.`);
  const byId = new Map(controller.layers.map((layer) => [layer.id, layer]));
  const visited = new Set<string>([layerId]);
  let cursor: AnimatorLayer | undefined = source;
  while (cursor) {
    if (visited.has(cursor.id)) throw new AnimatorAuthoringError("Synchronized layers cannot contain a cycle.");
    visited.add(cursor.id);
    cursor = cursor.syncedLayerId ? byId.get(cursor.syncedLayerId) : undefined;
  }
  const synchronized = updateLayer(controller, layerId, (layer) => (
    synchronizeAnimatorLayerStateMachine({
      ...layer,
      syncedLayerId: source.id,
      syncedLayerAffectsTiming: affectsTiming,
    }, source)
  ));
  const pruned = pruneAnimatorLayerBehaviorStateReferences(synchronized, new Set([layerId]));
  return reconcileAnimatorSynchronizedLayers(pruned, layerId);
}

export function removeAnimatorLayer(controller: AnimatorController, layerId: string): AnimatorController {
  if (!controller.layers.some((layer) => layer.id === layerId)) {
    throw new AnimatorAuthoringError(`Animator layer '${layerId}' was not found.`);
  }
  if (controller.layers.length === 1) {
    throw new AnimatorAuthoringError("An Animator Controller must keep at least one layer.");
  }
  return {
    ...controller,
    ...(controller.behaviorMap ? {
      behaviorMap: {
        ...controller.behaviorMap,
        layers: controller.behaviorMap.layers.filter((layer) => layer.layerId !== layerId),
      },
    } : {}),
    layers: controller.layers
      .filter((layer) => layer.id !== layerId)
      .map((layer) => layer.syncedLayerId === layerId
        ? { ...layer, syncedLayerId: undefined }
        : layer),
  };
}

export function addAnimatorState(
  controller: AnimatorController,
  layerId: string,
  options: { id?: string; name?: string; makeDefault?: boolean } = {},
): AnimatorController {
  const next = updateLayer(controller, layerId, (layer) => {
    if (layer.syncedLayerId) {
      throw new AnimatorAuthoringError("Synchronized layers inherit their state machine from the source layer.");
    }
    if (!canAddAnimatorState(layer)) {
      const limit = animatorStatesInLayer(layer).length >= MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER
        ? `${MAX_AUTHORED_ANIMATOR_STATES_PER_LAYER} states`
        : `${MAX_AUTHORED_ANIMATOR_TRANSITIONS_PER_LAYER} compiled transitions`;
      throw new AnimatorAuthoringError(`Animator layer '${layerId}' cannot exceed ${limit}.`);
    }
    const id = options.id ?? createAuthoredId("animator-state");
    if (animatorStatesInLayer(layer).some((state) => state.id === id)
      || animatorStateMachinesInLayer(layer).some((machine) => machine.id === id)) {
      throw new AnimatorAuthoringError(`Animator node '${id}' already exists.`);
    }
    const state = createAnimatorState(
      id,
      authoredName(options.name ?? `State ${layer.states.length + 1}`, "State"),
    );
    return {
      ...layer,
      states: [...layer.states, state],
      defaultStateId: options.makeDefault === true
        ? id
        : options.makeDefault === false ? layer.defaultStateId : layer.defaultStateId || id,
    };
  });
  return reconcileAnimatorSynchronizedLayers(next, layerId);
}

export function patchAnimatorState(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  patch: Partial<Pick<AnimatorState,
    | "name"
    | "speed"
    | "speedParameterId"
    | "cycleOffset"
    | "cycleOffsetParameterId"
    | "mirror"
    | "footIk"
    | "writeDefaults">>,
): AnimatorController {
  const next = updateState(controller, layerId, stateId, (state) => ({
    ...state,
    ...patch,
    ...(patch.name === undefined ? {} : { name: authoredName(patch.name, "State") }),
    ...(patch.speed === undefined || Number.isFinite(patch.speed) ? {} : { speed: state.speed }),
    ...(patch.cycleOffset === undefined || Number.isFinite(patch.cycleOffset)
      ? {}
      : { cycleOffset: state.cycleOffset }),
  }));
  return reconcileAnimatorSynchronizedLayers(next, layerId);
}

export function setAnimatorDefaultState(
  controller: AnimatorController,
  layerId: string,
  nodeId: string,
): AnimatorController {
  const next = updateLayer(controller, layerId, (layer) => {
    if (layer.syncedLayerId) {
      throw new AnimatorAuthoringError("Synchronized layers inherit their default state from the source layer.");
    }
    const isDirectState = layer.states.some((state) => state.id === nodeId);
    const isDirectStateMachine = (layer.stateMachines ?? []).some((machine) => machine.id === nodeId);
    if (!isDirectState && !isDirectStateMachine) {
      throw new AnimatorAuthoringError(`Animator state or state machine '${nodeId}' was not found.`);
    }
    return { ...layer, defaultStateId: nodeId };
  });
  return reconcileAnimatorSynchronizedLayers(next, layerId);
}

export function setAnimatorStateClip(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  clipRef: AssetRef | null,
): AnimatorController {
  const next = updateState(controller, layerId, stateId, (state) => ({
    ...state,
    motion: clipRef ? { kind: "clip", clipRef: { ...clipRef }, speed: 1 } : null,
  }));
  return reconcileAnimatorSynchronizedLayers(next, layerId);
}

export function setAnimatorStateMotion(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
  motion: AnimatorMotion | null,
): AnimatorController {
  const next = updateState(controller, layerId, stateId, (state) => ({ ...state, motion }));
  return reconcileAnimatorSynchronizedLayers(next, layerId);
}

export function removeAnimatorState(
  controller: AnimatorController,
  layerId: string,
  stateId: string,
): AnimatorController {
  const next = reconcileAnimatorSynchronizedLayers(updateLayer(controller, layerId, (layer) => {
    if (layer.syncedLayerId) {
      throw new AnimatorAuthoringError("Synchronized layers inherit their state machine from the source layer.");
    }
    if (!layer.states.some((state) => state.id === stateId)) {
      throw new AnimatorAuthoringError(`Animator state '${stateId}' was not found.`);
    }
    const keepsDestination = (transition: AnimatorTransition) => (
      transition.destination.kind !== "state" || transition.destination.stateId !== stateId
    );
    const states = layer.states
      .filter((state) => state.id !== stateId)
      .map((state) => ({ ...state, transitions: state.transitions.filter(keepsDestination) }));
    const stateMachines = layer.stateMachines?.map((machine) => ({
      ...machine,
      transitions: machine.transitions.filter(keepsDestination),
    }));
    return {
      ...layer,
      states,
      stateMachines,
      defaultStateId: layer.defaultStateId === stateId
        ? states[0]?.id ?? stateMachines?.[0]?.id ?? ""
        : layer.defaultStateId,
      anyStateTransitions: layer.anyStateTransitions.filter(keepsDestination),
    };
  }), layerId);
  if (!next.behaviorMap) return next;
  return {
    ...next,
    behaviorMap: {
      ...next.behaviorMap,
      layers: next.behaviorMap.layers.map((layer) => layer.layerId === layerId ? {
        ...layer,
        nodes: layer.nodes.filter((node) => node.id !== `state:${stateId}`),
      } : layer),
    },
  };
}
