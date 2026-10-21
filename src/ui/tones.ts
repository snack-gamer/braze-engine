/**
 * Engine category tones. Each name maps to exactly one color token in
 * `theme.css`; presentation code selects a tone and never a raw color.
 */
export type EditorTone =
  | "transform"
  | "mesh"
  | "rendering"
  | "lighting"
  | "physics"
  | "animation"
  | "effects"
  | "modifiers"
  | "neutral"
  | "prefab";

export function toneClassName(tone: EditorTone): string {
  return `tone-${tone}`;
}
