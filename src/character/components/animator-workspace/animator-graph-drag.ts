import type { CharacterVector2 } from "../../domain/character-values";

export function animatorGraphPositionAfterPointerMove(
  origin: CharacterVector2,
  pointerDelta: CharacterVector2,
  scale: number,
): CharacterVector2 {
  const safeScale = Math.max(0.01, scale);
  return [
    origin[0] + pointerDelta[0] / safeScale,
    origin[1] + pointerDelta[1] / safeScale,
  ];
}
