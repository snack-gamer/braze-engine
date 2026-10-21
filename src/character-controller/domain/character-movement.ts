/** Y-up displacement motor settings, in metres and degrees. Gravity is caller-owned. */
export type CharacterMovementSettings = Readonly<{
  skinWidth: number;
  stepHeight: number;
  groundSnap: number;
  maxSlopeDegrees: number;
}>;

export const DEFAULT_CHARACTER_MOVEMENT: CharacterMovementSettings = Object.freeze({
  skinWidth: 0.02, stepHeight: 0.3, groundSnap: 0.15, maxSlopeDegrees: 45,
});

export function normalizeCharacterMovement(value: unknown): CharacterMovementSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: keyof CharacterMovementSettings, min: number, max: number) => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(min, Math.min(max, value)) : DEFAULT_CHARACTER_MOVEMENT[key];
  };
  return { skinWidth: number("skinWidth", 0.001, 0.2), stepHeight: number("stepHeight", 0, 2),
    groundSnap: number("groundSnap", 0, 2), maxSlopeDegrees: number("maxSlopeDegrees", 0, 89) };
}
