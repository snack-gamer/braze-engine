import type {
  RuntimeAnimatorMotion,
  RuntimeAnimatorParameterValue,
} from "./animator-runtime";
import { ANIMATOR_DOCUMENT_LIMITS } from "../domain/character-document-limits";
import { evaluateBlendTree1d, type BlendTreeMotionWeight } from "./blend-tree-1d";
import { evaluateBlendTree2d } from "./blend-tree-2d";
import { evaluateDirectBlendTree } from "./blend-tree-direct";
import {
  hasCharacterRuntimeErrors,
  type CharacterRuntimeDiagnostic,
  type CharacterRuntimeResult,
} from "./diagnostics";

export const MAX_RUNTIME_BLEND_TREE_DEPTH = ANIMATOR_DOCUMENT_LIMITS.blendTreeDepth;
export const MAX_RUNTIME_BLEND_SAMPLES = 256;

export type RuntimeClipBlendSample = Readonly<{
  /** Stable within a compiled motion tree; callers prefix it with state identity. */
  sampleId: string;
  clipId: string;
  /** Clock time before loop wrapping/clamping, used for unambiguous event traversal. */
  unwrappedLocalTimeSeconds: number;
  localTimeSeconds: number;
  /** Present on runtime samples; optional for compatibility with external plan producers. */
  durationSeconds?: number;
  /** The authored per-use loop policy after source inheritance is resolved. */
  looping?: boolean;
  weight: number;
  mirrored?: boolean;
}>;

export type RuntimeMotionSampleOptions = Readonly<{ mirrored?: boolean }>;

export function sampleRuntimeAnimatorMotion(
  motion: RuntimeAnimatorMotion | null,
  normalizedTime: number,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  options: RuntimeMotionSampleOptions = {},
): CharacterRuntimeResult<readonly RuntimeClipBlendSample[]> {
  const context = sampleMotionContext(true);
  sampleMotion(
    motion, normalizedTime, parameters, context, 0, "motion", options.mirrored === true, 1, 1,
  );
  return {
    value: hasCharacterRuntimeErrors(context.diagnostics) ? null : context.samples!,
    diagnostics: context.diagnostics,
  };
}

/** Returns the current normalized-cycle rate used to advance a state's persistent phase. */
export function runtimeAnimatorMotionFrequency(
  motion: RuntimeAnimatorMotion | null,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  fallback: number,
): CharacterRuntimeResult<number> {
  const context = sampleMotionContext(false);
  sampleMotion(motion, 0, parameters, context, 0, "motion", false, 1, 1);
  const rate = context.totalWeight > 0 ? context.weightedRate / context.totalWeight : fallback;
  if (!Number.isFinite(rate) || rate < 0) context.diagnostics.push(error(
    "invalid-motion-frequency",
    "Animator motion frequency overflowed the finite runtime range.",
    "motion",
  ));
  return {
    value: hasCharacterRuntimeErrors(context.diagnostics) ? null : rate,
    diagnostics: context.diagnostics,
  };
}

type SampleMotionContext = {
  active: WeakSet<object>;
  diagnostics: CharacterRuntimeDiagnostic[];
  remainingSamples: number;
  weightedRate: number;
  totalWeight: number;
  samples: RuntimeClipBlendSample[] | null;
};

function sampleMotionContext(collectSamples: boolean): SampleMotionContext {
  return {
    active: new WeakSet<object>(), diagnostics: [], remainingSamples: MAX_RUNTIME_BLEND_SAMPLES,
    weightedRate: 0, totalWeight: 0, samples: collectSamples ? [] : null,
  };
}

function sampleMotion(
  motion: RuntimeAnimatorMotion | null,
  normalizedTime: number,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  context: SampleMotionContext,
  depth: number,
  path: string,
  mirrored: boolean,
  inheritedTimeScale: number,
  weight: number,
): void {
  if (!motion) return;
  if (depth > MAX_RUNTIME_BLEND_TREE_DEPTH) {
    context.diagnostics.push(error(
      "blend-tree-depth-exceeded",
      `Blend-tree evaluation cannot exceed depth ${MAX_RUNTIME_BLEND_TREE_DEPTH}.`,
      path,
    ));
    return;
  }
  if (motion.kind === "clip") {
    const parameterTimeScale = motion.timeScaleParameter
      ? numericParameter(parameters, motion.timeScaleParameter, context.diagnostics, path, "clip time scale")
      : null;
    if (motion.timeScaleParameter && parameterTimeScale === null) return;
    const timeScale = inheritedTimeScale
      * (motion.timeScaleParameter ? parameterTimeScale! : motion.timeScale);
    const rate = Math.abs(timeScale) / motion.durationSeconds;
    if (!Number.isFinite(timeScale) || !Number.isFinite(rate)) {
      context.diagnostics.push(error(
        "invalid-motion-frequency",
        "Animator motion frequency overflowed the finite runtime range.",
        path,
      ));
      return;
    }
    context.remainingSamples -= 1;
    if (context.remainingSamples < 0) {
      context.diagnostics.push(error(
        "blend-tree-sample-budget-exceeded",
        `A blend plan cannot exceed ${MAX_RUNTIME_BLEND_SAMPLES} clip samples.`,
        path,
      ));
      return;
    }
    const direction = Math.sign(timeScale) || Math.sign(inheritedTimeScale * motion.timeScale) || 1;
    const signedNormalizedTime = normalizedTime * direction;
    const unwrappedLocalTimeSeconds = signedNormalizedTime * motion.durationSeconds;
    context.weightedRate += rate * weight;
    context.totalWeight += weight;
    context.samples?.push({
      sampleId: path,
      clipId: motion.clipId,
      unwrappedLocalTimeSeconds,
      localTimeSeconds: sampleTime(signedNormalizedTime, motion.durationSeconds, motion.looping),
      durationSeconds: motion.durationSeconds,
      looping: motion.looping,
      weight,
      ...(mirrored ? { mirrored: true } : {}),
    });
    return;
  }
  if (context.active.has(motion)) {
    context.diagnostics.push(error("cyclic-runtime-blend-tree", "Runtime blend trees cannot contain cycles.", path));
    return;
  }
  context.active.add(motion);
  try {
    const weightedChildren = evaluateMotionWeights(motion, parameters, context.diagnostics, path);
    if (!weightedChildren) return;
    const childrenById = new Map(motion.children.map((child) => [child.id, child]));
    for (const weighted of weightedChildren) {
      if (weighted.weight <= 0) continue;
      const child = childrenById.get(weighted.motionId);
      if (!child) {
        context.diagnostics.push(error(
          "missing-runtime-blend-child",
          `Blend evaluation referenced missing child ${weighted.motionId}.`,
          path,
        ));
        continue;
      }
      sampleMotion(
        child.motion,
        normalizedTime,
        parameters,
        context,
        depth + 1,
        `${path}.children.${child.id}`,
        mirrored !== (child.mirror === true),
        inheritedTimeScale * child.timeScale,
        weight * weighted.weight,
      );
      if (context.remainingSamples < 0) break;
    }
  } finally {
    context.active.delete(motion);
  }
}

function evaluateMotionWeights(
  motion: Exclude<RuntimeAnimatorMotion, { kind: "clip" }>,
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  diagnostics: CharacterRuntimeDiagnostic[],
  path: string,
): readonly BlendTreeMotionWeight[] | null {
  if (motion.kind === "blendTree1d") {
    const parameter = numericParameter(parameters, motion.parameter, diagnostics, path);
    if (parameter === null) return null;
    const result = evaluateBlendTree1d(
      motion.children.map((child) => ({ motionId: child.id, threshold: child.threshold })),
      parameter,
    );
    diagnostics.push(...withPath(result.diagnostics, path));
    return result.value;
  }
  if (motion.kind === "blendTreeDirect") {
    const weighted = motion.children.map((child) => ({
      motionId: child.id,
      weight: numericParameter(
        parameters,
        child.weightParameter,
        diagnostics,
        `${path}.children.${child.id}`,
        "Direct blend weight",
      ),
    }));
    if (weighted.some((child) => child.weight === null)) return null;
    const result = evaluateDirectBlendTree(
      weighted.map((child) => ({ motionId: child.motionId, weight: child.weight! })),
      motion.normalizeWeights,
    );
    diagnostics.push(...withPath(result.diagnostics, path));
    return result.value;
  }
  const parameterX = numericParameter(parameters, motion.parameterX, diagnostics, path);
  const parameterY = numericParameter(parameters, motion.parameterY, diagnostics, path);
  if (parameterX === null || parameterY === null) return null;
  const result = evaluateBlendTree2d(
    motion.algorithm,
    motion.children.map((child) => ({ motionId: child.id, position: child.position })),
    parameterX,
    parameterY,
  );
  diagnostics.push(...withPath(result.diagnostics, path));
  return result.value;
}

function numericParameter(
  parameters: Readonly<Record<string, RuntimeAnimatorParameterValue>>,
  name: string,
  diagnostics: CharacterRuntimeDiagnostic[],
  path: string,
  purpose = "blend-tree parameter",
): number | null {
  const value = parameters[name];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  diagnostics.push(error(
    "invalid-blend-parameter",
    `Animator parameter ${name} is missing or not numeric for ${purpose}.`,
    path,
  ));
  return null;
}

function withPath(
  diagnostics: readonly CharacterRuntimeDiagnostic[],
  path: string,
): CharacterRuntimeDiagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic, path: diagnostic.path ?? path }));
}

function sampleTime(normalizedTime: number, duration: number, looping: boolean): number {
  return (looping
    ? positiveModulo(normalizedTime, 1)
    : Math.min(Math.max(normalizedTime, 0), 1)) * duration;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function error(code: string, message: string, path: string): CharacterRuntimeDiagnostic {
  return { code, severity: "error", message, path };
}
