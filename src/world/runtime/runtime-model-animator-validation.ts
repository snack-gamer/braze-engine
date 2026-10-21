import type { AnimatorComponent } from "../../character/domain/animator-component";
import { decodeAnimatorComponent, encodeAnimatorComponent } from "../../character/serialization/animator-component-codec";

/** Reject malformed command graphs instead of silently changing their meaning through codec defaults. */
export function validateRuntimeModelAnimator(animator: AnimatorComponent | undefined): void {
  if (!animator) return;
  const encoded = encodeAnimatorComponent(animator);
  const decoded = decodeAnimatorComponent(encoded);
  if (JSON.stringify(encoded) !== JSON.stringify(encodeAnimatorComponent(decoded))) throw new Error("Runtime Animator commands require a canonical validated component.");
}
