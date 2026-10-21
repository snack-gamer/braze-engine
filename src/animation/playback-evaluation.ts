import type { SceneObject } from "../types";
import { evaluateAnimationPlanTargets, type AnimationEvaluationPlan } from "./evaluate";

/** Evaluates one authoring target on demand without publishing React state. */
export function evaluateObjectAtPlayback(
  source: SceneObject | undefined,
  plan: AnimationEvaluationPlan,
  playhead: number,
): SceneObject | undefined {
  if (!source || !plan.tracks.has(source.id)) return source;
  return evaluateAnimationPlanTargets([source], plan, playhead)[0] ?? source;
}
