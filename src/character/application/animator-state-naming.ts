import type { AnimatorState } from "../domain/animator-controller";

/** Returns a stable, human-readable name that is unique within one layer. */
export function uniqueAnimatorStateName(
  states: readonly Pick<AnimatorState, "name">[],
  requestedName: string,
  fallbackName = "Clip",
): string {
  const baseName = requestedName.trim() || fallbackName;
  const used = new Set(states.map((state) => state.name));
  if (!used.has(baseName)) return baseName;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${baseName} ${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
