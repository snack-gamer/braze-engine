import type { ObjectModifier } from "../domain/authored-modifier";
import type { SceneObject } from "../../scene/domain/scene-object";

export function modifierComponentCount(object: SceneObject): number {
  return (
    (object.modifiers?.length ?? 0)
    + (object.animationPlayer ? 1 : 0)
    + (object.motionPulse ? 1 : 0)
  );
}

/** Replaces a modifier in place so authored evaluation order remains stable. */
export function replaceModifierById(
  modifiers: readonly ObjectModifier[],
  replacement: ObjectModifier,
): ObjectModifier[] {
  return modifiers.map((modifier) => modifier.id === replacement.id ? replacement : modifier);
}

/** Uses `undefined` for an empty list, matching the authored scene contract. */
export function removeModifierById(
  modifiers: readonly ObjectModifier[],
  modifierId: string,
): ObjectModifier[] | undefined {
  const next = modifiers.filter((modifier) => modifier.id !== modifierId);
  return next.length > 0 ? next : undefined;
}
