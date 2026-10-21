import type {
  BuoyancyModifier,
  BuoyancyPin,
  DisplacerModifier,
  ObjectModifier,
} from "./domain/authored-modifier";
import type { Vec3 } from "../scene/domain/scene-values";

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function vec3(raw: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(raw)) return fallback;
  return [
    typeof raw[0] === "number" && Number.isFinite(raw[0]) ? raw[0] : fallback[0],
    typeof raw[1] === "number" && Number.isFinite(raw[1]) ? raw[1] : fallback[1],
    typeof raw[2] === "number" && Number.isFinite(raw[2]) ? raw[2] : fallback[2],
  ];
}

function vec2(raw: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(raw)) return fallback;
  return [
    typeof raw[0] === "number" && Number.isFinite(raw[0]) ? raw[0] : fallback[0],
    typeof raw[1] === "number" && Number.isFinite(raw[1]) ? raw[1] : fallback[1],
  ];
}

function stringOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? value as T : fallback;
}

function parsePins(raw: unknown): BuoyancyPin[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((pin, index) => {
    const source = pin && typeof pin === "object" ? pin as Record<string, unknown> : {};
    return {
      id: typeof source.id === "string" ? source.id : `pin-imported-${index}`,
      name: typeof source.name === "string" ? source.name : `Pin ${index + 1}`,
      localOffset: vec3(source.local_offset ?? source.localOffset, [0, -0.35, 0]),
    };
  });
}

function parseBuoyancyModifier(raw: Record<string, unknown>, index: number): BuoyancyModifier {
  const pins = parsePins(raw.pins);
  return {
    id: typeof raw.id === "string" ? raw.id : `mod-buoyancy-imported-${index}`,
    type: "buoyancy",
    name: typeof raw.name === "string" ? raw.name : "Buoyancy",
    enabled: raw.enabled !== false,
    verticalOffset: clamp(raw.vertical_offset ?? raw.verticalOffset, -5, 5, 0),
    damping: clamp(raw.damping, 0, 1, 0.18),
    followTilt: raw.follow_tilt !== false && raw.followTilt !== false,
    tiltStrength: clamp(raw.tilt_strength ?? raw.tiltStrength, 0, 1, 0.75),
    maxTiltDeg: clamp(raw.max_tilt_degrees ?? raw.maxTiltDeg, 0, 60, 18),
    showPinGizmos: raw.show_pin_gizmos !== false && raw.showPinGizmos !== false,
    pinGizmoScale: clamp(raw.pin_gizmo_scale ?? raw.pinGizmoScale, 0.25, 3, 1),
    waterObjectId: typeof (raw.water_object_id ?? raw.waterObjectId) === "string"
      ? String(raw.water_object_id ?? raw.waterObjectId)
      : undefined,
    pins: pins.length > 0 ? pins : [
      { id: `pin-imported-${index}-0`, name: "Center", localOffset: [0, -0.35, 0] },
    ],
  };
}

function parseDisplacerModifier(raw: Record<string, unknown>, index: number): DisplacerModifier {
  return {
    id: typeof raw.id === "string" ? raw.id : `mod-displacer-imported-${index}`,
    type: "displacer",
    name: typeof raw.name === "string" ? raw.name : "Displacer",
    enabled: raw.enabled !== false,
    strength: clamp(raw.strength, -10, 10, 0.035),
    midlevel: clamp(raw.midlevel, 0, 1, 0.5),
    heightClamp: clamp(raw.height_clamp ?? raw.heightClamp, 0.001, 20, 0.18),
    direction: stringOption(raw.direction, ["normal", "y"], "normal"),
    source: stringOption(raw.source, ["noise", "texture", "blend"], "noise"),
    noiseScale: clamp(raw.noise_scale ?? raw.noiseScale, 0.01, 100, 2.4),
    noiseDetail: clamp(raw.noise_detail ?? raw.noiseDetail, 0, 1, 0.35),
    noiseContrast: clamp(raw.noise_contrast ?? raw.noiseContrast, 0.1, 6, 1.15),
    noiseSeed: clamp(raw.noise_seed ?? raw.noiseSeed, -10000, 10000, 0),
    textureUrl: typeof (raw.texture_url ?? raw.textureUrl) === "string"
      ? String(raw.texture_url ?? raw.textureUrl)
      : undefined,
    textureName: typeof (raw.texture_name ?? raw.textureName) === "string"
      ? String(raw.texture_name ?? raw.textureName)
      : undefined,
    textureFilename: typeof (raw.texture_filename ?? raw.textureFilename) === "string"
      ? String(raw.texture_filename ?? raw.textureFilename)
      : undefined,
    textureFlipY: typeof (raw.texture_flip_y ?? raw.textureFlipY) === "boolean"
      ? Boolean(raw.texture_flip_y ?? raw.textureFlipY)
      : undefined,
    textureChannel: stringOption(raw.texture_channel ?? raw.textureChannel, ["luminance", "red", "green", "blue", "alpha"], "luminance"),
    textureInfluence: clamp(raw.texture_influence ?? raw.textureInfluence, 0, 1, 1),
    uvScale: vec2(raw.uv_scale ?? raw.uvScale, [1, 1]),
    uvOffset: vec2(raw.uv_offset ?? raw.uvOffset, [0, 0]),
    bumpEnabled: raw.bump_enabled === true || raw.bumpEnabled === true,
    bumpStrength: clamp(raw.bump_strength ?? raw.bumpStrength, 0, 2, 0.08),
    cameraFade: raw.camera_fade !== false && raw.cameraFade !== false,
    cameraNear: clamp(raw.camera_near ?? raw.cameraNear, 0, 500, 8.8),
    cameraFar: clamp(raw.camera_far ?? raw.cameraFar, 0.001, 1000, 1),
  };
}

export function parseModifiers(raw: unknown): ObjectModifier[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw.flatMap((item, index): ObjectModifier[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const type = record.type ?? record.modifier_type;
    if (type === "buoyancy") return [parseBuoyancyModifier(record, index)];
    if (type === "displacer") return [parseDisplacerModifier(record, index)];
    return [];
  });
  return parsed.length > 0 ? parsed : undefined;
}

export function serializeModifiers(modifiers: ObjectModifier[] | undefined): Array<Record<string, unknown>> | null {
  if (!modifiers || modifiers.length === 0) return null;
  return modifiers.flatMap((modifier): Array<Record<string, unknown>> => {
    if (modifier.type === "buoyancy") {
      return [{
        id: modifier.id,
        type: modifier.type,
        name: modifier.name,
        enabled: modifier.enabled,
        vertical_offset: modifier.verticalOffset,
        damping: modifier.damping,
        follow_tilt: modifier.followTilt,
        tilt_strength: modifier.tiltStrength,
        max_tilt_degrees: modifier.maxTiltDeg,
        show_pin_gizmos: modifier.showPinGizmos,
        pin_gizmo_scale: modifier.pinGizmoScale,
        water_object_id: modifier.waterObjectId ?? null,
        pins: modifier.pins.map((pin) => ({
          id: pin.id,
          name: pin.name,
          local_offset: pin.localOffset,
        })),
      }];
    }
    if (modifier.type === "displacer") {
      return [{
        id: modifier.id,
        type: modifier.type,
        name: modifier.name,
        enabled: modifier.enabled,
        strength: modifier.strength,
        midlevel: modifier.midlevel,
        height_clamp: modifier.heightClamp,
        direction: modifier.direction,
        source: modifier.source,
        noise_scale: modifier.noiseScale,
        noise_detail: modifier.noiseDetail,
        noise_contrast: modifier.noiseContrast,
        noise_seed: modifier.noiseSeed,
        texture_url: modifier.textureUrl ?? null,
        texture_name: modifier.textureName ?? null,
        texture_filename: modifier.textureFilename ?? null,
        texture_flip_y: modifier.textureFlipY ?? null,
        texture_channel: modifier.textureChannel,
        texture_influence: modifier.textureInfluence,
        uv_scale: modifier.uvScale,
        uv_offset: modifier.uvOffset,
        bump_enabled: modifier.bumpEnabled,
        bump_strength: modifier.bumpStrength,
        camera_fade: modifier.cameraFade,
        camera_near: modifier.cameraNear,
        camera_far: modifier.cameraFar,
      }];
    }
    return [];
  });
}
