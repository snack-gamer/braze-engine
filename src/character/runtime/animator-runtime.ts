import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";
import { advanceAnimatorLayer } from "./animator-layer-runtime";
import { synchronizedAnimatorMotionFrequency } from "./animator-synchronized-timing";
import { validateRuntimeAnimatorController } from "./animator-runtime-validation";

export { validateRuntimeAnimatorController } from "./animator-runtime-validation";

export type RuntimeAnimatorParameterValue = number | boolean;
export type RuntimeAnimatorParameterDefinition = Readonly<{
  name: string;
  type: "float" | "int" | "bool" | "trigger";
  defaultValue: RuntimeAnimatorParameterValue;
}>;

export type RuntimeAnimatorCondition = Readonly<{
  parameter: string;
  operator: "equals" | "notEquals" | "greater" | "greaterOrEqual" | "less" | "lessOrEqual" | "triggered";
  value?: RuntimeAnimatorParameterValue;
}>;

export type RuntimeAnimatorMotion =
  | Readonly<{
      kind: "clip";
      clipId: string;
      durationSeconds: number;
      timeScale: number;
      timeScaleParameter?: string;
      looping: boolean;
    }>
  | Readonly<{
      kind: "blendTree1d";
      parameter: string;
      children: readonly RuntimeAnimatorBlendChild1d[];
    }>
  | Readonly<{
      kind: "blendTree2d";
      algorithm: "2dSimpleDirectional" | "2dFreeformDirectional" | "2dFreeformCartesian";
      parameterX: string;
      parameterY: string;
      children: readonly RuntimeAnimatorBlendChild2d[];
    }>
  | Readonly<{
      kind: "blendTreeDirect";
      normalizeWeights: boolean;
      children: readonly RuntimeAnimatorBlendChildDirect[];
    }>;

export type RuntimeAnimatorBlendChild = Readonly<{
  id: string;
  motion: RuntimeAnimatorMotion;
  timeScale: number;
  mirror?: boolean;
}>;

export type RuntimeAnimatorBlendChild1d = RuntimeAnimatorBlendChild & Readonly<{
  threshold: number;
}>;

export type RuntimeAnimatorBlendChild2d = RuntimeAnimatorBlendChild & Readonly<{
  position: readonly [number, number];
}>;

export type RuntimeAnimatorBlendChildDirect = RuntimeAnimatorBlendChild & Readonly<{
  weightParameter: string;
}>;

export type RuntimeAnimatorStateEventDefinition = Readonly<{
  id: string;
  name: string;
  timeNormalized: number;
  payload: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type RuntimeAnimatorStateDefinition = Readonly<{
  id: string;
  motion: RuntimeAnimatorMotion | null;
  durationSeconds: number;
  speed: number;
  speedParameter?: string;
  cycleOffset?: number;
  cycleOffsetParameter?: string;
  loop: boolean;
  mirror?: boolean;
  footIk?: boolean;
  writeDefaults?: boolean;
  events?: readonly RuntimeAnimatorStateEventDefinition[];
}>;

export type RuntimeAnimatorTransitionDefinition = Readonly<{
  id: string;
  sourceStateId: string | "*";
  destinationStateId: string | null;
  durationSeconds: number;
  destinationOffsetNormalized?: number;
  exitTimeNormalized?: number;
  conditions: readonly RuntimeAnimatorCondition[];
  allowSelfTransition?: boolean;
  interruptionSource?: "none" | "source" | "destination" | "sourceThenDestination" | "destinationThenSource";
  orderedInterruption?: boolean;
  fromAnyState?: boolean;
  authoringOrder?: number;
}>;

export type RuntimeAnimatorLayerDefinition = Readonly<{
  id: string;
  initialStateId: string;
  weight: number;
  blendMode: "override" | "additive";
  maskId?: string;
  ikPass?: boolean;
  syncedLayerId?: string;
  syncedLayerAffectsTiming?: boolean;
  states: readonly RuntimeAnimatorStateDefinition[];
  transitions: readonly RuntimeAnimatorTransitionDefinition[];
}>;

export type RuntimeAnimatorControllerDefinition = Readonly<{
  id: string;
  revision: string;
  parameters: readonly RuntimeAnimatorParameterDefinition[];
  layers: readonly RuntimeAnimatorLayerDefinition[];
}>;

export type ActiveAnimatorTransition = Readonly<{
  id: string;
  fromStateId: string;
  /** Distinguishes repeated/self-transition state instances for event tracking. */
  fromStateInstance: number;
  fromStateTimeSeconds: number;
  toStateId: string | null;
  elapsedSeconds: number;
  durationSeconds: number;
}>;

export type AnimatorLayerRuntimeState = Readonly<{
  layerId: string;
  currentStateId: string;
  /** Monotonic within this session; it is runtime identity, never persisted. */
  stateInstance: number;
  stateTimeSeconds: number;
  transition: ActiveAnimatorTransition | null;
  active?: boolean;
}>;

export type AnimatorRuntimeState = Readonly<{
  controllerId: string;
  controllerRevision: string;
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>;
  layers: readonly AnimatorLayerRuntimeState[];
}>;

export type AnimatorAdvanceResult = Readonly<{
  state: AnimatorRuntimeState;
  firedTransitionIds: readonly string[];
  consumedTriggers: readonly string[];
  firedStateEvents: readonly FiredAnimatorStateEvent[];
  eventsTruncated: boolean;
}>;

export type FiredAnimatorStateEvent = Readonly<{
  layerId: string;
  stateId: string;
  eventId: string;
  name: string;
  payload: Readonly<Record<string, string | number | boolean | null>>;
  occurrenceTimeSeconds: number;
}>;

export type AnimatorAdvanceOptions = Readonly<{
  maxStateEvents?: number;
}>;

export const MAX_STATE_EVENTS_PER_ADVANCE = 256;

export function createAnimatorRuntimeState(
  controller: RuntimeAnimatorControllerDefinition,
  overrides: Readonly<Record<string, RuntimeAnimatorParameterValue>> = {},
): CharacterRuntimeResult<AnimatorRuntimeState> {
  const diagnostics = validateRuntimeAnimatorController(controller);
  if (hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const parameters: Record<string, RuntimeAnimatorParameterValue> = {};
  for (const parameter of controller.parameters) {
    parameters[parameter.name] = validParameterOverride(parameter, overrides[parameter.name])
      ? overrides[parameter.name]!
      : parameter.defaultValue;
  }
  return characterRuntimeSuccess({
    controllerId: controller.id,
    controllerRevision: controller.revision,
    parameters,
    layers: controller.layers.map((layer) => ({
      layerId: layer.id,
      currentStateId: layer.initialStateId,
      stateInstance: 0,
      stateTimeSeconds: 0,
      transition: null,
      active: true,
    })),
  }, diagnostics);
}

export function withAnimatorParameter(
  controller: RuntimeAnimatorControllerDefinition,
  state: AnimatorRuntimeState,
  name: string,
  value: RuntimeAnimatorParameterValue,
): CharacterRuntimeResult<AnimatorRuntimeState> {
  const definition = controller.parameters.find((parameter) => parameter.name === name);
  if (!definition || !validParameterOverride(definition, value)) {
    return characterRuntimeFailure({
      code: "invalid-animator-parameter",
      severity: "error",
      message: `Animator parameter ${JSON.stringify(name)} is missing or has the wrong value type.`,
      path: `parameters.${name}`,
    });
  }
  return characterRuntimeSuccess({ ...state, parameters: { ...state.parameters, [name]: value } });
}

export function advanceAnimatorRuntime(
  controller: RuntimeAnimatorControllerDefinition,
  state: AnimatorRuntimeState,
  deltaSeconds: number,
  options: AnimatorAdvanceOptions = {},
): CharacterRuntimeResult<AnimatorAdvanceResult> {
  if (state.controllerId !== controller.id || state.controllerRevision !== controller.revision) {
    return characterRuntimeFailure(
      "stale-animator-runtime",
      "Animator runtime state does not match the controller revision.",
    );
  }
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    return characterRuntimeFailure(
      "invalid-animator-delta",
      "Animator delta time must be finite and non-negative.",
    );
  }

  const firedTransitionIds: string[] = [];
  const consumedTriggers = new Set<string>();
  const firedStateEvents: FiredAnimatorStateEvent[] = [];
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  const maxStateEvents = boundedEventLimit(options.maxStateEvents);
  let eventsTruncated = false;
  const layers: AnimatorLayerRuntimeState[] = [];
  for (let layerIndex = 0; layerIndex < controller.layers.length; layerIndex += 1) {
    const layer = controller.layers[layerIndex]!;
    const positionalState = state.layers[layerIndex];
    const current = (positionalState?.layerId === layer.id
      ? positionalState
      : state.layers.find((item) => item.layerId === layer.id))
      ?? {
        layerId: layer.id,
        currentStateId: layer.initialStateId,
        stateInstance: 0,
        stateTimeSeconds: 0,
        transition: null,
        active: true,
      };
    if (layer.syncedLayerId) {
      layers.push(current);
      continue;
    }
    const advanced = advanceAnimatorLayer(
      layer,
      current,
      state.parameters,
      deltaSeconds,
      Math.max(0, maxStateEvents - firedStateEvents.length),
      (sourceState) => synchronizedAnimatorMotionFrequency(
        controller, layer, sourceState, state.parameters,
      ),
    );
    if (advanced.firedTransitionId) firedTransitionIds.push(advanced.firedTransitionId);
    advanced.consumedTriggers.forEach((name) => consumedTriggers.add(name));
    firedStateEvents.push(...advanced.firedStateEvents);
    eventsTruncated ||= advanced.eventsTruncated;
    diagnostics.push(...advanced.diagnostics);
    layers.push(advanced.state);
  }
  synchronizeAnimatorLayers(controller, layers);
  if (hasCharacterRuntimeErrors(diagnostics)) return { value: null, diagnostics };
  const parameters = { ...state.parameters };
  consumedTriggers.forEach((name) => { parameters[name] = false; });
  return characterRuntimeSuccess({
    state: { ...state, parameters, layers },
    firedTransitionIds,
    consumedTriggers: [...consumedTriggers].sort(),
    firedStateEvents,
    eventsTruncated,
  }, diagnostics);
}

function synchronizeAnimatorLayers(
  controller: RuntimeAnimatorControllerDefinition,
  layers: AnimatorLayerRuntimeState[],
): void {
  const definitions = new Map(controller.layers.map((layer) => [layer.id, layer]));
  const states = new Map(layers.map((layer, index) => [controller.layers[index]!.id, layer]));
  const resolving = new Set<string>();
  const resolve = (layerId: string): AnimatorLayerRuntimeState | undefined => {
    const definition = definitions.get(layerId);
    const own = states.get(layerId);
    if (!definition || !own || !definition.syncedLayerId) return own;
    if (resolving.has(layerId)) return own;
    resolving.add(layerId);
    const source = resolve(definition.syncedLayerId);
    resolving.delete(layerId);
    if (!source) return own;
    const synchronized = { ...source, layerId: definition.id };
    states.set(layerId, synchronized);
    const index = controller.layers.findIndex((layer) => layer.id === layerId);
    if (index >= 0) layers[index] = synchronized;
    return synchronized;
  };
  controller.layers.forEach((layer) => resolve(layer.id));
}

function boundedEventLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_STATE_EVENTS_PER_ADVANCE;
  return Math.min(MAX_STATE_EVENTS_PER_ADVANCE, Math.max(0, Math.floor(value)));
}

function validParameterOverride(
  definition: RuntimeAnimatorParameterDefinition,
  value: RuntimeAnimatorParameterValue | undefined,
): value is RuntimeAnimatorParameterValue {
  if (value === undefined) return false;
  if (definition.type === "bool" || definition.type === "trigger") return typeof value === "boolean";
  return typeof value === "number" && Number.isFinite(value)
    && (definition.type !== "int" || Number.isInteger(value));
}
