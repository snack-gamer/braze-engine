import { ANIMATOR_DOCUMENT_LIMITS as limits, CHARACTER_DOCUMENT_LIMITS } from './character-document-limits';

export type AnimatorSchema = Readonly<Record<string, unknown>>;
const id = { type: 'string', minLength: 1, maxLength: 256, pattern: '\\S' };
const number = { type: 'number' }, boolean = { type: 'boolean' };
const choice = (...values: string[]) => ({ type: 'string', enum: values });
const object = (properties: Record<string, AnimatorSchema>, required: string[] = [], additionalProperties = false): AnimatorSchema =>
  ({ type: 'object', properties, required, additionalProperties });
const array = (items: AnimatorSchema, maxItems: number) => ({ type: 'array', items, maxItems });
const ref = (name: string) => ({ $ref: `#/$defs/${name}` });
const nonnegative = { ...number, minimum: 0 }, unit = { ...number, minimum: 0, maximum: 1 };
const vector2 = { ...array(number, 2), minItems: 2 };
const asset = object({ guid: { type: 'string', pattern: '^[a-fA-F0-9]{32}$' }, localId: id }, ['guid', 'localId']);
const scalar = { anyOf: [number, boolean, { type: 'string', maxLength: 4096 }, { type: 'null' }] };
const condition = { anyOf: [
  object({ parameterId: id, mode: choice('if', 'ifNot', 'triggered') }, ['parameterId', 'mode']),
  object({ parameterId: id, mode: choice('greater', 'less', 'equals', 'notEqual'), threshold: number }, ['parameterId', 'mode', 'threshold']),
] };
const transition = object({ id, destination: { anyOf: [
  object({ kind: { const: 'state' }, stateId: id }, ['kind', 'stateId']),
  object({ kind: { const: 'stateMachine' }, stateMachineId: id }, ['kind', 'stateMachineId']),
  object({ kind: { const: 'exit' } }, ['kind']),
] }, conditions: array(condition, limits.conditionsPerTransition), hasExitTime: { ...boolean, default: false },
  exitTimeNormalized: { ...nonnegative, default: 0.75 }, durationMode: { ...choice('seconds', 'normalized'), default: 'normalized' },
  duration: { ...nonnegative, default: 0.25 }, offsetNormalized: { ...nonnegative, default: 0 },
  interruptionSource: { ...choice('none', 'source', 'destination', 'sourceThenDestination', 'destinationThenSource'), default: 'none' },
  orderedInterruption: { ...boolean, default: true }, canTransitionToSelf: { ...boolean, default: false },
}, ['id', 'destination']);
const transitions = array(transition, limits.transitionsPerLayer);
const child = { id, motion: ref('animatorMotion'), timeScale: { ...number, default: 1 }, mirror: { ...boolean, default: false } };
const tree = { anyOf: [
  object({ kind: { const: '1d' }, parameterId: id, children: array(object({ ...child, threshold: number }, ['id', 'motion', 'threshold']), limits.blendTreeChildrenPerNode) }, ['kind', 'parameterId', 'children']),
  object({ kind: choice('2dSimpleDirectional', '2dFreeformDirectional', '2dFreeformCartesian'), parameterXId: id, parameterYId: id,
    children: array(object({ ...child, position: vector2 }, ['id', 'motion', 'position']), limits.blendTreeChildrenPerNode) }, ['kind', 'parameterXId', 'parameterYId', 'children']),
  object({ kind: { const: 'direct' }, normalizeWeights: { ...boolean, default: true },
    children: array(object({ ...child, weightParameterId: id }, ['id', 'motion', 'weightParameterId']), limits.blendTreeChildrenPerNode) }, ['kind', 'children']),
] };
const motion = { anyOf: [
  object({ kind: { const: 'clip' }, clipRef: asset, speed: { ...number, default: 1 }, timeScaleParameterId: id,
    loopMode: { ...choice('loop', 'once'), description: 'Omit to inherit the imported clip setting.' } }, ['kind', 'clipRef']),
  object({ kind: { const: 'blendTree' }, tree }, ['kind', 'tree']),
] };
const state = object({ id, name: id, motion: { anyOf: [ref('animatorMotion'), { type: 'null' }] },
  speed: { ...number, default: 1 }, speedParameterId: id, cycleOffset: { ...number, default: 0 }, cycleOffsetParameterId: id,
  mirror: boolean, footIk: boolean, writeDefaults: { ...boolean, default: true }, transitions,
  events: array(object({ id, name: id, timeNormalized: unit,
    payload: { type: 'object', maxProperties: CHARACTER_DOCUMENT_LIMITS.animationEventPayloadEntries, additionalProperties: scalar },
  }, ['id', 'name', 'timeNormalized']), limits.stateEventsPerState),
}, ['id', 'name']);
const scope = { id, name: id, defaultStateId: { type: 'string', maxLength: 256, description: 'Direct state or child machine ID. Empty leaves Entry unwired; omission selects the first node.' },
  states: array(state, limits.statesPerLayer), anyStateTransitions: transitions, stateMachines: array(ref('animatorMachine'), limits.stateMachinesPerLayer) };
const machine = object({ ...scope, transitions }, ['id', 'name']);
const layer = object({ ...scope, weight: unit, blendingMode: choice('override', 'additive'), avatarMaskRef: asset, ikPass: boolean,
  syncedLayerId: id, syncedLayerAffectsTiming: boolean,
}, ['id', 'name']);
const parameter = { anyOf: [
  object({ id, name: id, kind: { const: 'float' }, defaultValue: number }, ['id', 'name', 'kind', 'defaultValue']),
  object({ id, name: id, kind: { const: 'integer' }, defaultValue: { type: 'integer' } }, ['id', 'name', 'kind', 'defaultValue']),
  object({ id, name: id, kind: { const: 'boolean' }, defaultValue: boolean }, ['id', 'name', 'kind', 'defaultValue']),
  object({ id, name: id, kind: { const: 'trigger' }, defaultValue: { const: false } }, ['id', 'name', 'kind', 'defaultValue']),
] };
const behaviorMap = object({ version: { const: 1 }, layers: array(object({ layerId: id,
  nodes: array(object({ id: { ...id, maxLength: 270, description: 'Graph node ID: entry, any-state, exit, state:<stateId>, or state-machine:<childMachineId>. State IDs alone are not layout node IDs.' },
    position: { ...vector2, description: 'Graph canvas x/y coordinates; authoring layout only.' },
    stateMachineId: { ...id, description: 'Containing machine ID; omit for the layer root. The node must belong to this scope.' },
  }, ['id', 'position']), limits.graphNodesPerLayer),
}, ['layerId', 'nodes']), limits.layersPerController) }, ['version', 'layers']);
const controller = object({ version: { enum: [1, 'braze/animator-controller-v1'] }, id, name: id, revision: id, sourceRef: asset,
  parameters: array(parameter, limits.parametersPerController), layers: array(layer, limits.layersPerController), behaviorMap,
}, ['version', 'id', 'name', 'parameters', 'layers'], true);

/** Full embedded documents, using the same codecs and budgets as the Inspector. */
export const animatorComponentSchema = { ...object({ version: { enum: [1, 'braze/animator-component-v2'] }, enabled: { ...boolean, default: true },
  controller, avatarRef: asset,
  rootMotion: object({ mode: choice('disabled', 'applyToObject', 'extractOnly'), source: choice('clip', 'rootBone', 'hips'),
    translationAxes: object({ x: boolean, y: boolean, z: boolean }), rotation: choice('none', 'yaw', 'full'), bakeIntoPose: boolean }),
  updateMode: { ...choice('normal', 'unscaledTime', 'fixedStep'), default: 'normal' },
  cullingMode: { ...choice('alwaysAnimate', 'basedOnRenderVisibility'), default: 'basedOnRenderVisibility' },
  parameterOverrides: array(object({ parameterId: id, value: { anyOf: [number, boolean] } }, ['parameterId', 'value']), limits.parameterOverridesPerComponent),
  controllerRef: { description: 'Legacy external controllers are read-only. Embed a controller before editing.', type: 'null' },
}, ['version', 'controller'], true), description: 'Replace the complete Animator. Requires a ready imported FBX/glTF main model. Preserve unrelated fields, stable IDs and Behavior Map layout. Clips/avatars/masks use discovered AssetRefs; runtime readiness is checked in Play. Recursive machines and blend trees have depth 8; graph-wide budgets also apply.' };
export const animatorSchemaDefinitions = { animatorMotion: motion, animatorMachine: machine };
