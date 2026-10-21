import type {
  RuntimeAnimatorParameterValue,
  RuntimeAnimatorStateDefinition,
} from "./animator-runtime";
import { runtimeAnimatorMotionFrequency } from "./animator-motion-sampler";
import {
  characterRuntimeFailure,
  characterRuntimeSuccess,
  type CharacterRuntimeResult,
} from "./diagnostics";

export type AnimatorMotionFrequencyResolver = (
  state: RuntimeAnimatorStateDefinition,
) => CharacterRuntimeResult<number>;

/** Resolves one finite timeline step using the active motion blend's normalized frequency. */
export function resolveAnimatorStateTimeStep(
  state: RuntimeAnimatorStateDefinition,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  deltaSeconds: number,
  frequencyResolver?: AnimatorMotionFrequencyResolver,
): CharacterRuntimeResult<number> {
  const speed = state.speedParameter
    ? numericParameter(parameters, state.speedParameter, `state ${state.id} speed`)
    : characterRuntimeSuccess(state.speed);
  if (speed.value === null) return speed;
  const frequency = frequencyResolver
    ? frequencyResolver(state)
    : runtimeAnimatorMotionFrequency(state.motion, parameters, 1 / state.durationSeconds);
  if (frequency.value === null) return frequency;
  const value = deltaSeconds * speed.value * state.durationSeconds * frequency.value;
  const diagnostics = [...speed.diagnostics, ...frequency.diagnostics];
  return Number.isFinite(value)
    ? characterRuntimeSuccess(value, diagnostics)
    : characterRuntimeFailure([...diagnostics, {
        code: "invalid-state-time-step",
        severity: "error",
        message: `Animator state ${state.id} timeline rate overflowed the finite runtime range.`,
      }]);
}

/** Adds the loop phase offset without changing the state's transition/event timeline. */
export function resolveAnimatorMotionTime(
  state: RuntimeAnimatorStateDefinition,
  stateTimeSeconds: number,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
): CharacterRuntimeResult<number> {
  if (!state.loop) return characterRuntimeSuccess(stateTimeSeconds);
  const offset = state.cycleOffsetParameter
    ? numericParameter(parameters, state.cycleOffsetParameter, `state ${state.id} cycle offset`)
    : characterRuntimeSuccess(state.cycleOffset ?? 0);
  if (offset.value === null) return offset;
  return characterRuntimeSuccess(
    stateTimeSeconds + offset.value * state.durationSeconds,
    offset.diagnostics,
  );
}

function numericParameter(
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  name: string,
  purpose: string,
): CharacterRuntimeResult<number> {
  const value = parameters[name];
  if (typeof value === "number" && Number.isFinite(value)) return characterRuntimeSuccess(value);
  return characterRuntimeFailure({
    code: "invalid-state-timing-parameter",
    severity: "error",
    message: `Animator parameter ${name} must be numeric to drive ${purpose}.`,
    path: `parameters.${name}`,
  });
}
