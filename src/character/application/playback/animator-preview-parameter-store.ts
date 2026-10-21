import type { RuntimeAnimatorParameterValue } from "../../runtime/animator-runtime";

export type AnimatorPreviewParameterValues = Readonly<
  Record<string, RuntimeAnimatorParameterValue>
>;

/** Owns editor-only parameter previews independently of authored and runtime state. */
export const animatorPreviewParameters = new Map<string, AnimatorPreviewParameterValues>();
