import type {
  EffectorAimAxis,
  EffectorCurveKey,
  EffectorSettings,
  EffectorShape,
  EffectorTransformSpace,
  EffectorType,
} from "../scene/domain/effector";
import type { Vec3 } from "../scene/domain/scene-values";

// Ported 1:1 from BrazeFX (unity3d-brazefx): BrazeFractureEffector.cs and the
// concrete Random/Step/Target/Shader/PushApart effectors. Defaults mirror the
// Unity serialized defaults, including each type's Reset() overrides.

export const EFFECTOR_TYPE_OPTIONS: Array<{ id: EffectorType; label: string }> = [
  { id: "random", label: "Random" },
  { id: "step", label: "Step" },
  { id: "target", label: "Target" },
  { id: "shader", label: "Shader" },
  { id: "pushApart", label: "Push Apart" },
];

export const EFFECTOR_SHAPE_OPTIONS: Array<{ id: EffectorShape; label: string }> = [
  { id: "infinite", label: "Infinite" },
  { id: "sphere", label: "Sphere" },
  { id: "box", label: "Box" },
  { id: "capsule", label: "Capsule" },
  { id: "cylinder", label: "Cylinder" },
  { id: "cone", label: "Cone" },
  { id: "torus", label: "Torus" },
  { id: "plane", label: "Plane" },
];

export const EFFECTOR_SHAPE_INDEX: Record<EffectorShape, number> = {
  infinite: 0,
  sphere: 1,
  box: 2,
  capsule: 3,
  cylinder: 4,
  cone: 5,
  torus: 6,
  plane: 7,
};

export const EFFECTOR_AIM_AXIS_OPTIONS: Array<{ id: EffectorAimAxis; label: string }> = [
  { id: "+z", label: "+Z" },
  { id: "-z", label: "-Z" },
  { id: "+y", label: "+Y" },
  { id: "-y", label: "-Y" },
  { id: "+x", label: "+X" },
  { id: "-x", label: "-X" },
];

export const EFFECTOR_AIM_AXIS_INDEX: Record<EffectorAimAxis, number> = {
  "+z": 0,
  "-z": 1,
  "+y": 2,
  "-y": 3,
  "+x": 4,
  "-x": 5,
};

// Unity: new Keyframe(0,1), new Keyframe(1,0) — tangents default to 0.
export const defaultFalloffCurve: EffectorCurveKey[] = [
  { time: 0, value: 1, inTangent: 0, outTangent: 0 },
  { time: 1, value: 0, inTangent: 0, outTangent: 0 },
];

// Unity: AnimationCurve.Linear(0,0,1,1) — tangents 1.
export const defaultLinearCurve: EffectorCurveKey[] = [
  { time: 0, value: 0, inTangent: 1, outTangent: 1 },
  { time: 1, value: 1, inTangent: 1, outTangent: 1 },
];

export const defaultEffectorSettings: EffectorSettings = {
  enabled: true,
  type: "random",
  shape: "infinite",
  radius: 3,
  boxSize: [4, 4, 4],
  height: 6,
  torusMajorRadius: 2,
  torusMinorRadius: 0.5,
  planeSize: [4, 4],
  planeThickness: 0.25,
  falloff: defaultFalloffCurve,
  strength: 1,
  transformSpace: "effector",
  affectPosition: true,
  positionAmount: [1, 1, 1],
  affectRotation: true,
  rotationAmount: [30, 30, 30],
  affectScale: false,
  scaleAmount: [0.25, 0.25, 0.25],
  uniformScale: true,
  randomMode: "random",
  seed: 12345,
  outputRange: [-1, 1],
  synchronized: false,
  indexed: true,
  noiseSpace: "object",
  noiseSize: 1,
  animationSpeed: 0,
  stepOrdering: "objectY",
  stepInputRange: [0, 1],
  stepCurve: defaultLinearCurve,
  stepOffset: 0,
  stepLoop: false,
  stepReverse: false,
  stepQuantize: 0,
  targetObjectId: undefined,
  aimAxis: "+z",
  usePitch: true,
  upMode: "world",
  customUp: [0, 1, 0],
  repel: false,
  repelDistance: 1,
  repelStrength: 1,
  shaderNoiseType: "fractal",
  shaderNoiseSpace: "effector",
  globalScale: 1,
  relativeScale: [1, 1, 1],
  coordinateOffset: [0, 0, 0],
  octaves: 4,
  roughness: 0.5,
  lacunarity: 2,
  evolutionSpeed: 0,
  movement: [0, 1, 0],
  movementSpeed: 0,
  lowClip: 0,
  highClip: 1,
  brightness: 0,
  contrast: 0,
  absolute: false,
  invert: false,
  remapCurve: defaultLinearCurve,
  pushDirection: "all",
  separationRadius: 0.1,
  iterations: 4,
};

function finite(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function vec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value)) return [...fallback] as Vec3;
  return [finite(value[0], fallback[0]), finite(value[1], fallback[1]), finite(value[2], fallback[2])];
}

function vec2(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return [...fallback] as [number, number];
  return [finite(value[0], fallback[0]), finite(value[1], fallback[1])];
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function curveKeys(value: unknown, fallback: EffectorCurveKey[]): EffectorCurveKey[] {
  if (!Array.isArray(value) || value.length === 0) return fallback.map((key) => ({ ...key }));
  const keys = value
    .map((item) => ({
      time: finite(item?.time, 0),
      value: finite(item?.value, 0),
      inTangent: finite(item?.inTangent ?? item?.in_tangent, 0),
      outTangent: finite(item?.outTangent ?? item?.out_tangent, 0),
    }))
    .sort((a, b) => a.time - b.time);
  return keys;
}

export function normalizeEffectorSettings(settings: Partial<EffectorSettings> | undefined): EffectorSettings {
  const d = defaultEffectorSettings;
  if (!settings) return { ...d, falloff: d.falloff.map((k) => ({ ...k })), stepCurve: d.stepCurve.map((k) => ({ ...k })), remapCurve: d.remapCurve.map((k) => ({ ...k })) };
  return {
    enabled: settings.enabled !== false,
    type: oneOf(settings.type, ["random", "step", "target", "shader", "pushApart"] as const, d.type),
    shape: oneOf(settings.shape, ["infinite", "sphere", "box", "capsule", "cylinder", "cone", "torus", "plane"] as const, d.shape),
    radius: Math.max(0, finite(settings.radius, d.radius)),
    boxSize: vec3(settings.boxSize, d.boxSize).map((v) => Math.max(0, v)) as Vec3,
    height: Math.max(0, finite(settings.height, d.height)),
    torusMajorRadius: Math.max(0, finite(settings.torusMajorRadius, d.torusMajorRadius)),
    torusMinorRadius: Math.max(0, finite(settings.torusMinorRadius, d.torusMinorRadius)),
    planeSize: vec2(settings.planeSize, d.planeSize).map((v) => Math.max(0, v)) as [number, number],
    planeThickness: Math.max(0, finite(settings.planeThickness, d.planeThickness)),
    falloff: curveKeys(settings.falloff, d.falloff),
    strength: Math.min(2, Math.max(-2, finite(settings.strength, d.strength))),
    transformSpace: oneOf(settings.transformSpace, ["world", "effector"] as const, d.transformSpace) as EffectorTransformSpace,
    affectPosition: settings.affectPosition !== false,
    positionAmount: vec3(settings.positionAmount, d.positionAmount),
    affectRotation: settings.affectRotation !== false,
    rotationAmount: vec3(settings.rotationAmount, d.rotationAmount),
    affectScale: settings.affectScale === true,
    scaleAmount: vec3(settings.scaleAmount, d.scaleAmount).map((v) => Math.max(0, v)) as Vec3,
    uniformScale: settings.uniformScale !== false,
    randomMode: oneOf(settings.randomMode, ["random", "gaussian", "noise", "turbulence"] as const, d.randomMode),
    seed: Math.round(finite(settings.seed, d.seed)),
    outputRange: vec2(settings.outputRange, d.outputRange),
    synchronized: settings.synchronized === true,
    indexed: settings.indexed !== false,
    noiseSpace: oneOf(settings.noiseSpace, ["global", "object"] as const, d.noiseSpace),
    noiseSize: Math.max(0.001, finite(settings.noiseSize, d.noiseSize)),
    animationSpeed: finite(settings.animationSpeed, d.animationSpeed),
    stepOrdering: oneOf(settings.stepOrdering, ["index", "objectX", "objectY", "objectZ", "radial"] as const, d.stepOrdering),
    stepInputRange: vec2(settings.stepInputRange, d.stepInputRange),
    stepCurve: curveKeys(settings.stepCurve, d.stepCurve),
    stepOffset: finite(settings.stepOffset, d.stepOffset),
    stepLoop: settings.stepLoop === true,
    stepReverse: settings.stepReverse === true,
    stepQuantize: Math.min(64, Math.max(0, Math.round(finite(settings.stepQuantize, d.stepQuantize)))),
    targetObjectId: typeof settings.targetObjectId === "string" ? settings.targetObjectId : undefined,
    aimAxis: oneOf(settings.aimAxis, ["+z", "-z", "+y", "-y", "+x", "-x"] as const, d.aimAxis),
    usePitch: settings.usePitch !== false,
    upMode: oneOf(settings.upMode, ["world", "effector", "target", "custom"] as const, d.upMode),
    customUp: vec3(settings.customUp, d.customUp),
    repel: settings.repel === true,
    repelDistance: Math.max(0, finite(settings.repelDistance, d.repelDistance)),
    repelStrength: Math.max(0, finite(settings.repelStrength, d.repelStrength)),
    shaderNoiseType: oneOf(settings.shaderNoiseType, ["soft", "fractal", "turbulence", "ridged"] as const, d.shaderNoiseType),
    shaderNoiseSpace: oneOf(settings.shaderNoiseSpace, ["effector", "object", "world"] as const, d.shaderNoiseSpace),
    globalScale: Math.max(0.001, finite(settings.globalScale, d.globalScale)),
    relativeScale: vec3(settings.relativeScale, d.relativeScale),
    coordinateOffset: vec3(settings.coordinateOffset, d.coordinateOffset),
    octaves: Math.min(8, Math.max(1, Math.round(finite(settings.octaves, d.octaves)))),
    roughness: Math.min(1, Math.max(0, finite(settings.roughness, d.roughness))),
    lacunarity: Math.min(4, Math.max(1.01, finite(settings.lacunarity, d.lacunarity))),
    evolutionSpeed: finite(settings.evolutionSpeed, d.evolutionSpeed),
    movement: vec3(settings.movement, d.movement),
    movementSpeed: finite(settings.movementSpeed, d.movementSpeed),
    lowClip: Math.min(1, Math.max(0, finite(settings.lowClip, d.lowClip))),
    highClip: Math.min(1, Math.max(0, finite(settings.highClip, d.highClip))),
    brightness: Math.min(1, Math.max(-1, finite(settings.brightness, d.brightness))),
    contrast: Math.min(1, Math.max(-1, finite(settings.contrast, d.contrast))),
    absolute: settings.absolute === true,
    invert: settings.invert === true,
    remapCurve: curveKeys(settings.remapCurve, d.remapCurve),
    pushDirection: oneOf(settings.pushDirection, ["all", "x", "y", "z"] as const, d.pushDirection),
    separationRadius: Math.max(0, finite(settings.separationRadius, d.separationRadius)),
    iterations: Math.min(32, Math.max(1, Math.round(finite(settings.iterations, d.iterations)))),
  };
}

// Unity's per-type Reset() overrides: Step/Target/PushApart default to an
// Infinite field and their own transform channels.
export function effectorTypeDefaults(type: EffectorType): Partial<EffectorSettings> {
  switch (type) {
    case "step":
      return { shape: "infinite", affectPosition: true, positionAmount: [0, 1, 0], affectRotation: false, affectScale: false };
    case "target":
      return { shape: "infinite", affectPosition: false, affectRotation: true, affectScale: false };
    case "pushApart":
      return { shape: "infinite", affectPosition: true, affectRotation: false, affectScale: false };
    default:
      return {};
  }
}

// ---- Unity AnimationCurve evaluation (cubic hermite with tangents) ----

export function evaluateCurve(keys: EffectorCurveKey[], time: number): number {
  if (keys.length === 0) return 0;
  if (keys.length === 1) return keys[0].value;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;
  let upper = 1;
  while (upper < keys.length - 1 && keys[upper].time < time) upper += 1;
  const k0 = keys[upper - 1];
  const k1 = keys[upper];
  const dt = k1.time - k0.time;
  if (dt <= 1e-9) return k1.value;
  const t = (time - k0.time) / dt;
  const t2 = t * t;
  const t3 = t2 * t;
  const m0 = k0.outTangent * dt;
  const m1 = k1.inTangent * dt;
  return (
    (2 * t3 - 3 * t2 + 1) * k0.value +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * k1.value +
    (t3 - t2) * m1
  );
}

// GPU parity: BrazeFX uploads each curve as a 256-entry LUT and lerps between
// texels. Reproduce that exactly so falloff edges match the Unity render.
export function buildCurveLut(keys: EffectorCurveKey[]): Float32Array {
  const lut = new Float32Array(256);
  for (let x = 0; x < 256; x++) lut[x] = evaluateCurve(keys, x / 255);
  return lut;
}

export function sampleLut(lut: Float32Array, t: number): number {
  const x = Math.min(1, Math.max(0, t)) * 255;
  const x0 = Math.floor(x);
  const x1 = Math.min(x0 + 1, 255);
  return lut[x0] + (lut[x1] - lut[x0]) * (x - x0);
}

// ---- serialization (snake_case wire format, matching lib/cloner.ts style) ----

function serializeCurve(keys: EffectorCurveKey[]) {
  return keys.map((key) => ({
    time: key.time,
    value: key.value,
    in_tangent: key.inTangent,
    out_tangent: key.outTangent,
  }));
}

export function serializeEffectorSettings(settings: EffectorSettings | undefined) {
  if (!settings) return null;
  const e = normalizeEffectorSettings(settings);
  return {
    enabled: e.enabled,
    type: e.type,
    shape: e.shape,
    radius: e.radius,
    box_size: e.boxSize,
    height: e.height,
    torus_major_radius: e.torusMajorRadius,
    torus_minor_radius: e.torusMinorRadius,
    plane_size: e.planeSize,
    plane_thickness: e.planeThickness,
    falloff: serializeCurve(e.falloff),
    strength: e.strength,
    transform_space: e.transformSpace,
    affect_position: e.affectPosition,
    position_amount: e.positionAmount,
    affect_rotation: e.affectRotation,
    rotation_amount: e.rotationAmount,
    affect_scale: e.affectScale,
    scale_amount: e.scaleAmount,
    uniform_scale: e.uniformScale,
    random_mode: e.randomMode,
    seed: e.seed,
    output_range: e.outputRange,
    synchronized: e.synchronized,
    indexed: e.indexed,
    noise_space: e.noiseSpace,
    noise_size: e.noiseSize,
    animation_speed: e.animationSpeed,
    step_ordering: e.stepOrdering,
    step_input_range: e.stepInputRange,
    step_curve: serializeCurve(e.stepCurve),
    step_offset: e.stepOffset,
    step_loop: e.stepLoop,
    step_reverse: e.stepReverse,
    step_quantize: e.stepQuantize,
    target_object_id: e.targetObjectId ?? null,
    aim_axis: e.aimAxis,
    use_pitch: e.usePitch,
    up_mode: e.upMode,
    custom_up: e.customUp,
    repel: e.repel,
    repel_distance: e.repelDistance,
    repel_strength: e.repelStrength,
    shader_noise_type: e.shaderNoiseType,
    shader_noise_space: e.shaderNoiseSpace,
    global_scale: e.globalScale,
    relative_scale: e.relativeScale,
    coordinate_offset: e.coordinateOffset,
    octaves: e.octaves,
    roughness: e.roughness,
    lacunarity: e.lacunarity,
    evolution_speed: e.evolutionSpeed,
    movement: e.movement,
    movement_speed: e.movementSpeed,
    low_clip: e.lowClip,
    high_clip: e.highClip,
    brightness: e.brightness,
    contrast: e.contrast,
    absolute: e.absolute,
    invert: e.invert,
    remap_curve: serializeCurve(e.remapCurve),
    push_direction: e.pushDirection,
    separation_radius: e.separationRadius,
    iterations: e.iterations,
  };
}

export function parseEffectorSettings(raw: any): EffectorSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return normalizeEffectorSettings({
    enabled: raw.enabled !== false,
    type: raw.type,
    shape: raw.shape,
    radius: raw.radius,
    boxSize: raw.box_size ?? raw.boxSize,
    height: raw.height,
    torusMajorRadius: raw.torus_major_radius ?? raw.torusMajorRadius,
    torusMinorRadius: raw.torus_minor_radius ?? raw.torusMinorRadius,
    planeSize: raw.plane_size ?? raw.planeSize,
    planeThickness: raw.plane_thickness ?? raw.planeThickness,
    falloff: raw.falloff,
    strength: raw.strength,
    transformSpace: raw.transform_space ?? raw.transformSpace,
    affectPosition: raw.affect_position ?? raw.affectPosition,
    positionAmount: raw.position_amount ?? raw.positionAmount,
    affectRotation: raw.affect_rotation ?? raw.affectRotation,
    rotationAmount: raw.rotation_amount ?? raw.rotationAmount,
    affectScale: raw.affect_scale ?? raw.affectScale,
    scaleAmount: raw.scale_amount ?? raw.scaleAmount,
    uniformScale: raw.uniform_scale ?? raw.uniformScale,
    randomMode: raw.random_mode ?? raw.randomMode,
    seed: raw.seed,
    outputRange: raw.output_range ?? raw.outputRange,
    synchronized: raw.synchronized,
    indexed: raw.indexed,
    noiseSpace: raw.noise_space ?? raw.noiseSpace,
    noiseSize: raw.noise_size ?? raw.noiseSize,
    animationSpeed: raw.animation_speed ?? raw.animationSpeed,
    stepOrdering: raw.step_ordering ?? raw.stepOrdering,
    stepInputRange: raw.step_input_range ?? raw.stepInputRange,
    stepCurve: raw.step_curve ?? raw.stepCurve,
    stepOffset: raw.step_offset ?? raw.stepOffset,
    stepLoop: raw.step_loop ?? raw.stepLoop,
    stepReverse: raw.step_reverse ?? raw.stepReverse,
    stepQuantize: raw.step_quantize ?? raw.stepQuantize,
    targetObjectId: raw.target_object_id ?? raw.targetObjectId ?? undefined,
    aimAxis: raw.aim_axis ?? raw.aimAxis,
    usePitch: raw.use_pitch ?? raw.usePitch,
    upMode: raw.up_mode ?? raw.upMode,
    customUp: raw.custom_up ?? raw.customUp,
    repel: raw.repel,
    repelDistance: raw.repel_distance ?? raw.repelDistance,
    repelStrength: raw.repel_strength ?? raw.repelStrength,
    shaderNoiseType: raw.shader_noise_type ?? raw.shaderNoiseType,
    shaderNoiseSpace: raw.shader_noise_space ?? raw.shaderNoiseSpace,
    globalScale: raw.global_scale ?? raw.globalScale,
    relativeScale: raw.relative_scale ?? raw.relativeScale,
    coordinateOffset: raw.coordinate_offset ?? raw.coordinateOffset,
    octaves: raw.octaves,
    roughness: raw.roughness,
    lacunarity: raw.lacunarity,
    evolutionSpeed: raw.evolution_speed ?? raw.evolutionSpeed,
    movement: raw.movement,
    movementSpeed: raw.movement_speed ?? raw.movementSpeed,
    lowClip: raw.low_clip ?? raw.lowClip,
    highClip: raw.high_clip ?? raw.highClip,
    brightness: raw.brightness,
    contrast: raw.contrast,
    absolute: raw.absolute,
    invert: raw.invert,
    remapCurve: raw.remap_curve ?? raw.remapCurve,
    pushDirection: raw.push_direction ?? raw.pushDirection,
    separationRadius: raw.separation_radius ?? raw.separationRadius,
    iterations: raw.iterations,
  } as Partial<EffectorSettings>);
}
