export type LegacySkyLightInput = Readonly<{
  altitudeDeg: number;
  azimuthDeg: number;
}>;

export const LEGACY_SKY_LIGHT_DEFAULTS: LegacySkyLightInput = Object.freeze({
  altitudeDeg: 18,
  azimuthDeg: 210,
});

/** Reads removed Sun-from-Sky fields only for one-time hierarchy-light migration. */
export function readLegacySkyLightInput(rawEnvironment: unknown): LegacySkyLightInput | null {
  if (!isRecord(rawEnvironment)) return null;
  const skyWorld = rawEnvironment.worldSource === "sky" || rawEnvironment.backgroundMode === "sky";
  if (!skyWorld) return null;
  const sky = isRecord(rawEnvironment.sky) ? rawEnvironment.sky : {};
  return Object.freeze({
    altitudeDeg: finiteClamped(
      sky.sunAltitudeDeg,
      LEGACY_SKY_LIGHT_DEFAULTS.altitudeDeg,
      -8,
      90,
    ),
    azimuthDeg: finiteClamped(
      sky.sunAzimuthDeg,
      LEGACY_SKY_LIGHT_DEFAULTS.azimuthDeg,
      0,
      360,
    ),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteClamped(value: unknown, fallback: number, min: number, max: number): number {
  const finite = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, finite));
}
