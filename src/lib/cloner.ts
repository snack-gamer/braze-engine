import type {
  ClonerAxisMode,
  ClonerMode,
  ClonerSettings,
  ClonerSourceMode,
} from "../scene/domain/cloner";
import type { Vec3 } from "../scene/domain/scene-values";

export const CLONER_MODE_OPTIONS: Array<{ id: ClonerMode; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "radial", label: "Radial" },
  { id: "grid", label: "Grid" },
  { id: "random", label: "Random Box" },
  { id: "surface", label: "Surface" },
];

export const CLONER_SOURCE_MODE_OPTIONS: Array<{ id: ClonerSourceMode; label: string }> = [
  { id: "iterate", label: "Iterate" },
  { id: "random", label: "Random" },
];

const CLONER_MODES = new Set<ClonerMode>(CLONER_MODE_OPTIONS.map((option) => option.id));
const SOURCE_MODES = new Set<ClonerSourceMode>(CLONER_SOURCE_MODE_OPTIONS.map((option) => option.id));
const AXIS_MODES = new Set<ClonerAxisMode>(["unified", "individual"]);

export const defaultClonerSettings: ClonerSettings = {
  enabled: true,
  mode: "grid",
  sourceMode: "iterate",
  inputObjectId: undefined,
  count: 100,
  seed: 1,
  showSources: false,
  linearStep: [1.8, 0, 0],
  gridCount: [5, 1, 5],
  gridSpacing: [1.8, 1.8, 1.8],
  radius: 4,
  arc: 360,
  startAngle: 0,
  alignRadial: true,
  alignToSurface: true,
  randomSize: [8, 0, 8],
  clonePosition: [0, 0, 0],
  cloneRotation: [0, 0, 0],
  cloneScale: [1, 1, 1],
  jitterPosition: [0, 0, 0],
  jitterPositionAxisMode: "unified",
  jitterRotation: [0, 0, 0],
  jitterRotationAxisMode: "unified",
  jitterScale: [0, 0, 0],
  jitterScaleAxisMode: "unified",
  // BrazeFX parity (BrazeCloner.cs defaults)
  gridCenter: true,
  linearRotation: [0, 0, 0],
  linearScale: [1, 1, 1],
  radialRings: 1,
  radialCountStep: 0,
  radialRadiusStep: 1,
  radialRingTwist: 0,
  radialPlane: "xz",
  radialAxisStep: 0,
  radialCenterAxis: true,
  radialSpiralRadius: 0,
  radialSpiralAxis: 0,
  radialWaveCycles: 1,
  radialWaveRadius: 0,
  radialWaveAxis: 0,
  radialWavePhase: 0,
  radialWaveAxialPhase: 90,
  radialWaveRingPhase: 0,
  radialRotationOffset: [0, 0, 0],
  radialRotationStep: [0, 0, 0],
  radialScaleStep: 0,
  radialScaleWave: 0,
  alignment: "default",
  alignmentAxis: "+x",
  alignmentUp: "auto",
  uniformScale: 1,
  effectorIds: [],
};

function finiteNumber(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function positiveInt(value: unknown, fallback: number, max = 100000): number {
  return Math.max(1, Math.min(max, Math.round(finiteNumber(value, fallback))));
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value)) return [...fallback] as Vec3;
  return [
    finiteNumber(value[0], fallback[0]),
    finiteNumber(value[1], fallback[1]),
    finiteNumber(value[2], fallback[2]),
  ];
}

function vec3OrScalar(value: unknown, fallback: Vec3): Vec3 {
  if (typeof value === "number") return [value, value, value];
  return vec3(value, fallback);
}

function positiveVec3OrScalar(value: unknown, fallback: Vec3): Vec3 {
  return vec3OrScalar(value, fallback).map((item) => Math.max(0, item)) as Vec3;
}

function positiveVec3(value: unknown, fallback: Vec3, max = 512): Vec3 {
  const parsed = vec3(value, fallback);
  return parsed.map((item) => Math.max(1, Math.min(max, Math.round(item)))) as Vec3;
}

function axisMode(value: unknown, fallback: ClonerAxisMode): ClonerAxisMode {
  return typeof value === "string" && AXIS_MODES.has(value as ClonerAxisMode) ? value as ClonerAxisMode : fallback;
}

const ALIGNMENTS = new Set(["default", "none", "path", "outward", "inward"]);
const ALIGNMENT_AXES = new Set(["+z", "-z", "+y", "-y", "+x", "-x"]);
const ALIGNMENT_UPS = new Set(["auto", "x", "y", "z"]);
const RADIAL_PLANES = new Set(["xy", "xz", "yz"]);

export function normalizeClonerSettings(settings: ClonerSettings | undefined): ClonerSettings {
  if (!settings) return { ...defaultClonerSettings, effectorIds: [] };
  const legacyAlignment = settings.alignRadial === false ? "none" : defaultClonerSettings.alignment;
  return {
    ...defaultClonerSettings,
    ...settings,
    enabled: settings.enabled !== false,
    gridCenter: settings.gridCenter !== false,
    linearRotation: vec3(settings.linearRotation, defaultClonerSettings.linearRotation),
    linearScale: vec3(settings.linearScale, defaultClonerSettings.linearScale),
    radialRings: positiveInt(settings.radialRings, defaultClonerSettings.radialRings, 4096),
    radialCountStep: Math.max(0, Math.round(finiteNumber(settings.radialCountStep, defaultClonerSettings.radialCountStep))),
    radialRadiusStep: finiteNumber(settings.radialRadiusStep, defaultClonerSettings.radialRadiusStep),
    radialRingTwist: finiteNumber(settings.radialRingTwist, defaultClonerSettings.radialRingTwist),
    radialPlane: RADIAL_PLANES.has(settings.radialPlane as string) ? settings.radialPlane : defaultClonerSettings.radialPlane,
    radialAxisStep: finiteNumber(settings.radialAxisStep, defaultClonerSettings.radialAxisStep),
    radialCenterAxis: settings.radialCenterAxis !== false,
    radialSpiralRadius: finiteNumber(settings.radialSpiralRadius, defaultClonerSettings.radialSpiralRadius),
    radialSpiralAxis: finiteNumber(settings.radialSpiralAxis, defaultClonerSettings.radialSpiralAxis),
    radialWaveCycles: Math.max(0, finiteNumber(settings.radialWaveCycles, defaultClonerSettings.radialWaveCycles)),
    radialWaveRadius: finiteNumber(settings.radialWaveRadius, defaultClonerSettings.radialWaveRadius),
    radialWaveAxis: finiteNumber(settings.radialWaveAxis, defaultClonerSettings.radialWaveAxis),
    radialWavePhase: finiteNumber(settings.radialWavePhase, defaultClonerSettings.radialWavePhase),
    radialWaveAxialPhase: finiteNumber(settings.radialWaveAxialPhase, defaultClonerSettings.radialWaveAxialPhase),
    radialWaveRingPhase: finiteNumber(settings.radialWaveRingPhase, defaultClonerSettings.radialWaveRingPhase),
    radialRotationOffset: vec3(settings.radialRotationOffset, defaultClonerSettings.radialRotationOffset),
    radialRotationStep: vec3(settings.radialRotationStep, defaultClonerSettings.radialRotationStep),
    radialScaleStep: finiteNumber(settings.radialScaleStep, defaultClonerSettings.radialScaleStep),
    radialScaleWave: finiteNumber(settings.radialScaleWave, defaultClonerSettings.radialScaleWave),
    alignment: ALIGNMENTS.has(settings.alignment as string) ? settings.alignment : legacyAlignment,
    alignmentAxis: ALIGNMENT_AXES.has(settings.alignmentAxis as string) ? settings.alignmentAxis : defaultClonerSettings.alignmentAxis,
    alignmentUp: ALIGNMENT_UPS.has(settings.alignmentUp as string) ? settings.alignmentUp : defaultClonerSettings.alignmentUp,
    uniformScale: Math.min(1, Math.max(-1, finiteNumber(settings.uniformScale, defaultClonerSettings.uniformScale))),
    effectorIds: Array.isArray(settings.effectorIds)
      ? settings.effectorIds.filter((id): id is string => typeof id === "string")
      : [],
    mode: CLONER_MODES.has(settings.mode) ? settings.mode : defaultClonerSettings.mode,
    sourceMode: SOURCE_MODES.has(settings.sourceMode) ? settings.sourceMode : defaultClonerSettings.sourceMode,
    inputObjectId: typeof settings.inputObjectId === "string" ? settings.inputObjectId : undefined,
    count: positiveInt(settings.count, defaultClonerSettings.count),
    seed: positiveInt(settings.seed, defaultClonerSettings.seed, 999999),
    showSources: Boolean(settings.showSources),
    linearStep: vec3(settings.linearStep, defaultClonerSettings.linearStep),
    gridCount: positiveVec3(settings.gridCount, defaultClonerSettings.gridCount),
    gridSpacing: vec3(settings.gridSpacing, defaultClonerSettings.gridSpacing),
    radius: Math.max(0, finiteNumber(settings.radius, defaultClonerSettings.radius)),
    arc: finiteNumber(settings.arc, defaultClonerSettings.arc),
    startAngle: finiteNumber(settings.startAngle, defaultClonerSettings.startAngle),
    alignRadial: settings.alignRadial !== false,
    alignToSurface: settings.alignToSurface !== false,
    randomSize: vec3(settings.randomSize, defaultClonerSettings.randomSize),
    clonePosition: vec3(settings.clonePosition, defaultClonerSettings.clonePosition),
    cloneRotation: vec3(settings.cloneRotation, defaultClonerSettings.cloneRotation),
    cloneScale: vec3(settings.cloneScale, defaultClonerSettings.cloneScale),
    jitterPosition: vec3(settings.jitterPosition, defaultClonerSettings.jitterPosition),
    jitterPositionAxisMode: axisMode(settings.jitterPositionAxisMode, defaultClonerSettings.jitterPositionAxisMode),
    jitterRotation: vec3(settings.jitterRotation, defaultClonerSettings.jitterRotation),
    jitterRotationAxisMode: axisMode(settings.jitterRotationAxisMode, defaultClonerSettings.jitterRotationAxisMode),
    jitterScale: positiveVec3OrScalar(settings.jitterScale, defaultClonerSettings.jitterScale),
    jitterScaleAxisMode: axisMode(settings.jitterScaleAxisMode, defaultClonerSettings.jitterScaleAxisMode),
  };
}

export function parseClonerSettings(raw: any): ClonerSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return normalizeClonerSettings({
    enabled: raw.enabled !== false,
    mode: raw.mode,
    sourceMode: raw.source_mode ?? raw.sourceMode,
    inputObjectId: raw.input_object_id ?? raw.inputObjectId,
    count: raw.count,
    seed: raw.seed,
    showSources: raw.show_sources ?? raw.showSources,
    linearStep: raw.linear_step ?? raw.linearStep,
    gridCount: raw.grid_count ?? raw.gridCount,
    gridSpacing: raw.grid_spacing ?? raw.gridSpacing,
    radius: raw.radius,
    arc: raw.arc,
    startAngle: raw.start_angle ?? raw.startAngle,
    alignRadial: raw.align_radial ?? raw.alignRadial,
    alignToSurface: raw.align_to_surface ?? raw.alignToSurface,
    randomSize: raw.random_size ?? raw.randomSize,
    clonePosition: raw.clone_position ?? raw.clonePosition,
    cloneRotation: raw.clone_rotation ?? raw.cloneRotation,
    cloneScale: raw.clone_scale ?? raw.cloneScale,
    jitterPosition: raw.jitter_position ?? raw.jitterPosition,
    jitterPositionAxisMode: raw.jitter_position_axis_mode ?? raw.jitterPositionAxisMode,
    jitterRotation: raw.jitter_rotation ?? raw.jitterRotation,
    jitterRotationAxisMode: raw.jitter_rotation_axis_mode ?? raw.jitterRotationAxisMode,
    jitterScale: raw.jitter_scale ?? raw.jitterScale,
    jitterScaleAxisMode: raw.jitter_scale_axis_mode ?? raw.jitterScaleAxisMode,
    gridCenter: raw.grid_center ?? raw.gridCenter,
    linearRotation: raw.linear_rotation ?? raw.linearRotation,
    linearScale: raw.linear_scale ?? raw.linearScale,
    radialRings: raw.radial_rings ?? raw.radialRings,
    radialCountStep: raw.radial_count_step ?? raw.radialCountStep,
    radialRadiusStep: raw.radial_radius_step ?? raw.radialRadiusStep,
    radialRingTwist: raw.radial_ring_twist ?? raw.radialRingTwist,
    radialPlane: raw.radial_plane ?? raw.radialPlane,
    radialAxisStep: raw.radial_axis_step ?? raw.radialAxisStep,
    radialCenterAxis: raw.radial_center_axis ?? raw.radialCenterAxis,
    radialSpiralRadius: raw.radial_spiral_radius ?? raw.radialSpiralRadius,
    radialSpiralAxis: raw.radial_spiral_axis ?? raw.radialSpiralAxis,
    radialWaveCycles: raw.radial_wave_cycles ?? raw.radialWaveCycles,
    radialWaveRadius: raw.radial_wave_radius ?? raw.radialWaveRadius,
    radialWaveAxis: raw.radial_wave_axis ?? raw.radialWaveAxis,
    radialWavePhase: raw.radial_wave_phase ?? raw.radialWavePhase,
    radialWaveAxialPhase: raw.radial_wave_axial_phase ?? raw.radialWaveAxialPhase,
    radialWaveRingPhase: raw.radial_wave_ring_phase ?? raw.radialWaveRingPhase,
    radialRotationOffset: raw.radial_rotation_offset ?? raw.radialRotationOffset,
    radialRotationStep: raw.radial_rotation_step ?? raw.radialRotationStep,
    radialScaleStep: raw.radial_scale_step ?? raw.radialScaleStep,
    radialScaleWave: raw.radial_scale_wave ?? raw.radialScaleWave,
    alignment: raw.alignment,
    alignmentAxis: raw.alignment_axis ?? raw.alignmentAxis,
    alignmentUp: raw.alignment_up ?? raw.alignmentUp,
    uniformScale: raw.uniform_scale ?? raw.uniformScale,
    effectorIds: raw.effector_ids ?? raw.effectorIds,
  } as ClonerSettings);
}

export function serializeClonerSettings(settings: ClonerSettings | undefined) {
  if (!settings) return null;
  const cloner = normalizeClonerSettings(settings);
  return {
    enabled: cloner.enabled,
    mode: cloner.mode,
    source_mode: cloner.sourceMode,
    input_object_id: cloner.inputObjectId ?? null,
    count: cloner.count,
    seed: cloner.seed,
    show_sources: cloner.showSources,
    linear_step: cloner.linearStep,
    grid_count: cloner.gridCount,
    grid_spacing: cloner.gridSpacing,
    radius: cloner.radius,
    arc: cloner.arc,
    start_angle: cloner.startAngle,
    align_radial: cloner.alignRadial,
    align_to_surface: cloner.alignToSurface,
    random_size: cloner.randomSize,
    clone_position: cloner.clonePosition,
    clone_rotation: cloner.cloneRotation,
    clone_scale: cloner.cloneScale,
    jitter_position: cloner.jitterPosition,
    jitter_position_axis_mode: cloner.jitterPositionAxisMode,
    jitter_rotation: cloner.jitterRotation,
    jitter_rotation_axis_mode: cloner.jitterRotationAxisMode,
    jitter_scale: cloner.jitterScale,
    jitter_scale_axis_mode: cloner.jitterScaleAxisMode,
    grid_center: cloner.gridCenter,
    linear_rotation: cloner.linearRotation,
    linear_scale: cloner.linearScale,
    radial_rings: cloner.radialRings,
    radial_count_step: cloner.radialCountStep,
    radial_radius_step: cloner.radialRadiusStep,
    radial_ring_twist: cloner.radialRingTwist,
    radial_plane: cloner.radialPlane,
    radial_axis_step: cloner.radialAxisStep,
    radial_center_axis: cloner.radialCenterAxis,
    radial_spiral_radius: cloner.radialSpiralRadius,
    radial_spiral_axis: cloner.radialSpiralAxis,
    radial_wave_cycles: cloner.radialWaveCycles,
    radial_wave_radius: cloner.radialWaveRadius,
    radial_wave_axis: cloner.radialWaveAxis,
    radial_wave_phase: cloner.radialWavePhase,
    radial_wave_axial_phase: cloner.radialWaveAxialPhase,
    radial_wave_ring_phase: cloner.radialWaveRingPhase,
    radial_rotation_offset: cloner.radialRotationOffset,
    radial_rotation_step: cloner.radialRotationStep,
    radial_scale_step: cloner.radialScaleStep,
    radial_scale_wave: cloner.radialScaleWave,
    alignment: cloner.alignment,
    alignment_axis: cloner.alignmentAxis,
    alignment_up: cloner.alignmentUp,
    uniform_scale: cloner.uniformScale,
    effector_ids: cloner.effectorIds,
  };
}
