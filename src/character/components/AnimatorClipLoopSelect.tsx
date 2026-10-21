import type { AnimatorClipMotion } from "../domain/blend-tree";

export const ANIMATOR_CLIP_SOURCE_LOOP_SELECTION = "source" as const;

export type AnimatorClipLoopSelection = NonNullable<AnimatorClipMotion["loopMode"]>
  | typeof ANIMATOR_CLIP_SOURCE_LOOP_SELECTION;

type AnimatorClipLoopSelectProps = Readonly<{
  value: AnimatorClipMotion["loopMode"];
  sourceLooping?: boolean;
  onChange: (value: AnimatorClipMotion["loopMode"]) => void;
}>;

/** Encodes an inherited authored policy as an explicit, stable form value. */
export function animatorClipLoopSelection(
  loopMode: AnimatorClipMotion["loopMode"],
): AnimatorClipLoopSelection {
  return loopMode ?? ANIMATOR_CLIP_SOURCE_LOOP_SELECTION;
}

/** Decodes the presentation-only source sentinel without persisting it. */
export function animatorClipLoopModeFromSelection(value: string): AnimatorClipMotion["loopMode"] {
  return value === "loop" || value === "once" ? value : undefined;
}

/** Edits the shared per-use loop policy for Clip and Blend Tree motions. */
export function AnimatorClipLoopSelect({ value, sourceLooping, onChange }: AnimatorClipLoopSelectProps) {
  const sourceLabel = sourceLooping === undefined
    ? "Clip Default"
    : `Clip Default (${sourceLooping ? "Loop" : "Play Once"})`;
  return <label>Loop<select
    aria-label="Clip loop mode"
    value={animatorClipLoopSelection(value)}
    onChange={(event) => onChange(animatorClipLoopModeFromSelection(event.currentTarget.value))}
  >
    <option value={ANIMATOR_CLIP_SOURCE_LOOP_SELECTION}>{sourceLabel}</option>
    <option value="loop">Loop</option>
    <option value="once">Play Once</option>
  </select></label>;
}
