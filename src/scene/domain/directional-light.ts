/**
 * Unity-style directional key light. The owning SceneObject transform supplies
 * the direction; position and scale remain authorable hierarchy properties.
 */
export type DirectionalLightSettings = {
  enabled: boolean;
  color: string;
  intensity: number;
  castShadows: boolean;
};

export const DEFAULT_DIRECTIONAL_LIGHT_SETTINGS: DirectionalLightSettings = {
  enabled: true,
  color: "#fff4df",
  intensity: 1.5,
  castShadows: true,
};

export const DIRECTIONAL_LIGHT_AUTHORING_VERSION = 2 as const;

export function needsDirectionalLightMigration(version: unknown): boolean {
  return (
    typeof version !== "number"
    || !Number.isFinite(version)
    || version < DIRECTIONAL_LIGHT_AUTHORING_VERSION
  );
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function validColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function normalizeDirectionalLightSettings(raw: unknown): DirectionalLightSettings {
  const source = raw && typeof raw === "object"
    ? raw as Partial<DirectionalLightSettings> & { cast_shadows?: unknown }
    : {};
  return {
    enabled: source.enabled !== false,
    color: validColor(source.color, DEFAULT_DIRECTIONAL_LIGHT_SETTINGS.color),
    intensity: Math.min(20, Math.max(
      0,
      finite(source.intensity, DEFAULT_DIRECTIONAL_LIGHT_SETTINGS.intensity),
    )),
    castShadows:
      typeof source.castShadows === "boolean"
        ? source.castShadows
        : typeof source.cast_shadows === "boolean"
          ? source.cast_shadows
          : DEFAULT_DIRECTIONAL_LIGHT_SETTINGS.castShadows,
  };
}
