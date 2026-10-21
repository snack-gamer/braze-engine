import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";
import {
  sampleRuntimeAnimatorMotion,
  type RuntimeClipBlendSample,
} from "./animator-motion-sampler";
import { resolveAnimatorMotionTime } from "./animator-state-timing";
import type {
  AnimatorLayerRuntimeState,
  AnimatorRuntimeState,
  RuntimeAnimatorControllerDefinition,
} from "./animator-runtime";
import { runtimeAnimatorLayerIndex } from "./animator-runtime-index";

export type RuntimeAvatarMaskBinding = Readonly<{
  id: string;
  revision: string;
  gpuMaskIndex: number;
}>;

export type ClipBlendSample = RuntimeClipBlendSample;

/** A compact instruction intended for a batched pose evaluator, not per-bone CPU blending. */
export type LayerBlendInstruction = Readonly<{
  layerId: string;
  blendMode: "override" | "additive";
  layerWeight: number;
  gpuMaskIndex: number | null;
  clips: readonly ClipBlendSample[];
  ikPass?: boolean;
  footIk?: boolean;
  writeDefaults?: boolean;
}>;

export type LayerBlendPlan = Readonly<{
  controllerId: string;
  controllerRevision: string;
  instructions: readonly LayerBlendInstruction[];
}>;

export function buildLayerBlendPlan(
  controller: RuntimeAnimatorControllerDefinition,
  runtime: AnimatorRuntimeState,
  masks: readonly RuntimeAvatarMaskBinding[] = [],
): CharacterRuntimeResult<LayerBlendPlan> {
  if (controller.id !== runtime.controllerId || controller.revision !== runtime.controllerRevision) {
    return characterRuntimeFailure(
      "stale-layer-blend-plan",
      "Cannot build a layer plan from a stale Animator runtime.",
    );
  }
  const masksById = new Map(masks.map((mask) => [mask.id, mask]));
  const instructions: LayerBlendInstruction[] = [];
  const diagnostics: CharacterRuntimeDiagnostic[] = [];
  for (let layerIndex = 0; layerIndex < controller.layers.length; layerIndex += 1) {
    const layer = controller.layers[layerIndex]!;
    const positionalState = runtime.layers[layerIndex];
    const state = positionalState?.layerId === layer.id
      ? positionalState
      : runtime.layers.find((item) => item.layerId === layer.id);
    // Unity-compatible base-layer semantics: its authored weight/blend mode do
    // not attenuate the pose. Subsequent layers blend over that full base.
    const layerWeight = layerIndex === 0 ? 1 : clamp01(layer.weight);
    if (!state || state.active === false || layerWeight <= 0) continue;
    const mask = layer.maskId ? masksById.get(layer.maskId) : undefined;
    if (layer.maskId && !mask) {
      return characterRuntimeFailure(
        "missing-avatar-mask",
        `Animator layer ${layer.id} references missing mask ${layer.maskId}.`,
      );
    }
    const clips = clipsForLayer(controller, layer, state, runtime.parameters);
    diagnostics.push(...clips.diagnostics);
    if (!clips.value) return { value: null, diagnostics };
    instructions.push({
      layerId: layer.id,
      blendMode: layerIndex === 0 ? "override" : layer.blendMode,
      layerWeight,
      gpuMaskIndex: mask?.gpuMaskIndex ?? null,
      clips: clips.value,
      ikPass: layer.ikPass === true,
      footIk: activeStateFlag(layer, state, "footIk"),
      writeDefaults: activeStateFlag(layer, state, "writeDefaults", true),
    });
  }
  return characterRuntimeSuccess({
    controllerId: controller.id,
    controllerRevision: controller.revision,
    instructions,
  }, diagnostics);
}

function clipsForLayer(
  controller: RuntimeAnimatorControllerDefinition,
  layer: RuntimeAnimatorControllerDefinition["layers"][number],
  runtime: AnimatorLayerRuntimeState,
  parameters: AnimatorRuntimeState["parameters"],
): CharacterRuntimeResult<readonly ClipBlendSample[]> {
  const byId = runtimeAnimatorLayerIndex(layer).statesById;
  const current = byId.get(runtime.currentStateId);
  if (!current) {
    return characterRuntimeFailure(
      "missing-runtime-state",
      `Animator runtime references missing state ${runtime.currentStateId}.`,
    );
  }
  const transitionWeight = runtime.transition
    ? clamp01(runtime.transition.elapsedSeconds / runtime.transition.durationSeconds)
    : 1;
  const currentTime = resolveAnimatorMotionTime(
    current,
    synchronizedMotionTime(controller, layer, current.id, runtime.stateTimeSeconds),
    parameters,
  );
  if (currentTime.value === null) return { value: null, diagnostics: currentTime.diagnostics };
  const currentClips = sampleRuntimeAnimatorMotion(
    current.motion,
    currentTime.value / current.durationSeconds,
    parameters,
    { mirrored: current.mirror === true },
  );
  if (!currentClips.value) return currentClips;
  const diagnostics = [...currentTime.diagnostics, ...currentClips.diagnostics];
  const exiting = runtime.transition?.toStateId === null;
  const output = currentClips.value.map((sample) => ({
    ...sample,
    sampleId: `${current.id}\u0000${runtime.stateInstance}\u0000${sample.sampleId}`,
    weight: sample.weight * (exiting ? 1 - transitionWeight : transitionWeight),
  }));
  if (!runtime.transition) return characterRuntimeSuccess(output, diagnostics);
  if (exiting) return characterRuntimeSuccess(output, diagnostics);
  const previous = byId.get(runtime.transition.fromStateId);
  if (!previous) {
    return characterRuntimeFailure(
      "missing-transition-state",
      `Animator transition references missing state ${runtime.transition.fromStateId}.`,
    );
  }
  const previousTime = resolveAnimatorMotionTime(
    previous,
    synchronizedMotionTime(
      controller,
      layer,
      previous.id,
      runtime.transition.fromStateTimeSeconds,
    ),
    parameters,
  );
  diagnostics.push(...previousTime.diagnostics);
  if (previousTime.value === null) return { value: null, diagnostics };
  const previousClips = sampleRuntimeAnimatorMotion(
    previous.motion,
    previousTime.value / previous.durationSeconds,
    parameters,
    { mirrored: previous.mirror === true },
  );
  diagnostics.push(...previousClips.diagnostics);
  if (!previousClips.value) return { value: null, diagnostics };
  return characterRuntimeSuccess([
    ...previousClips.value.map((sample) => ({
      ...sample,
      sampleId: `${previous.id}\u0000${runtime.transition!.fromStateInstance}\u0000${sample.sampleId}`,
      weight: sample.weight * (1 - transitionWeight),
    })),
    ...output,
  ], diagnostics);
}

function synchronizedMotionTime(
  controller: RuntimeAnimatorControllerDefinition,
  layer: RuntimeAnimatorControllerDefinition["layers"][number],
  stateId: string,
  sourceTimeSeconds: number,
): number {
  if (!layer.syncedLayerId) return sourceTimeSeconds;
  const sourceLayer = controller.layers.find((candidate) => candidate.id === layer.syncedLayerId);
  const sourceState = sourceLayer?.states.find((state) => state.id === stateId);
  const overrideState = layer.states.find((state) => state.id === stateId);
  if (!sourceState || !overrideState) return sourceTimeSeconds;
  return sourceTimeSeconds * overrideState.durationSeconds / sourceState.durationSeconds;
}

function activeStateFlag(
  layer: RuntimeAnimatorControllerDefinition["layers"][number],
  runtime: AnimatorLayerRuntimeState,
  flag: "footIk" | "writeDefaults",
  fallback = false,
): boolean {
  const current = layer.states.find((state) => state.id === runtime.currentStateId);
  const previous = runtime.transition
    ? layer.states.find((state) => state.id === runtime.transition!.fromStateId)
    : undefined;
  if (flag === "footIk") return current?.footIk === true || previous?.footIk === true;
  return current?.writeDefaults ?? previous?.writeDefaults ?? fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
