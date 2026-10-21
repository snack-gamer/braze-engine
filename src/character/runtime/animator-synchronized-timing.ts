import { runtimeAnimatorMotionFrequency } from "./animator-motion-sampler";
import type {
  RuntimeAnimatorControllerDefinition,
  RuntimeAnimatorLayerDefinition,
  RuntimeAnimatorParameterValue,
  RuntimeAnimatorStateDefinition,
} from "./animator-runtime";
import {
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";

/** Blends live motion periods from synchronized layers that opt into affecting timing. */
export function synchronizedAnimatorMotionFrequency(
  controller: RuntimeAnimatorControllerDefinition,
  sourceLayer: RuntimeAnimatorLayerDefinition,
  sourceState: RuntimeAnimatorStateDefinition,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
): CharacterRuntimeResult<number> {
  const source = runtimeAnimatorMotionFrequency(
    sourceState.motion, parameters, 1 / sourceState.durationSeconds,
  );
  if (source.value === null) return source;
  let frequency = source.value;
  const diagnostics = [...source.diagnostics];
  for (const layer of controller.layers) {
    if (layer.syncedLayerId !== sourceLayer.id || !layer.syncedLayerAffectsTiming) continue;
    const override = layer.states.find((state) => state.id === sourceState.id);
    const weight = Math.min(1, Math.max(0, Number.isFinite(layer.weight) ? layer.weight : 0));
    if (!override || weight === 0) continue;
    const candidate = runtimeAnimatorMotionFrequency(
      override.motion, parameters, 1 / override.durationSeconds,
    );
    diagnostics.push(...candidate.diagnostics);
    if (candidate.value === null) return { value: null, diagnostics };
    if (weight === 1) frequency = candidate.value;
    else frequency = frequency > 0 && candidate.value > 0
      ? 1 / ((1 - weight) / frequency + weight / candidate.value)
      : 0;
  }
  return characterRuntimeSuccess(frequency, diagnostics);
}
