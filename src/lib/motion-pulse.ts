import type {
  MotionPulseAxisMode,
  MotionPulseComponent,
  MotionPulseEasing,
  MotionPulseMode,
  MotionPulseTarget,
} from "../scene/domain/motion-pulse";
import type { SceneObject } from "../scene/domain/scene-object";
import type { Vec3 } from "../scene/domain/scene-values";
import { createAuthoredId, createDeterministicAuthoredId } from "../identity/authored-id";

export const MOTION_PULSE_EASING_OPTIONS: Array<{ id: MotionPulseEasing; label: string }> = [
  { id: "linear", label: "Linear" },
  { id: "smooth", label: "Smooth" },
  { id: "easeIn", label: "Ease In" },
  { id: "easeOut", label: "Ease Out" },
  { id: "easeInOut", label: "Ease In Out" },
];

export const MOTION_PULSE_MODE_OPTIONS: Array<{ id: MotionPulseMode; label: string }> = [
  { id: "loop", label: "Loop" },
  { id: "restart", label: "Restart" },
  { id: "yoyo", label: "Yoyo" },
  { id: "pulse", label: "Pulse" },
];

const EASINGS = new Set<MotionPulseEasing>(MOTION_PULSE_EASING_OPTIONS.map((option) => option.id));
const MODES = new Set<MotionPulseMode>(MOTION_PULSE_MODE_OPTIONS.map((option) => option.id));
const AXIS_MODES = new Set<MotionPulseAxisMode>(["individual", "unified"]);

const defaultMotionPulseComponent: MotionPulseComponent = {
  enabled: true,
  targets: [],
};

function makeId(prefix: string): string {
  return createAuthoredId(prefix);
}

function finiteNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function parseVec3(value: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (!Array.isArray(value)) return [...fallback] as Vec3;
  return [finiteNumber(value[0], fallback[0]), finiteNumber(value[1], fallback[1]), finiteNumber(value[2], fallback[2])];
}

export function createMotionPulseTarget(target?: Pick<SceneObject, "id" | "name">, index = 0): MotionPulseTarget {
  return {
    id: makeId("pulse-target"),
    objectId: target?.id,
    name: target?.name || `Target ${index + 1}`,
    enabled: true,
    mode: "loop",
    axisMode: "individual",
    rate: 1,
    phase: 0,
    easing: "linear",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [0, 0, 0],
  };
}

export function createMotionPulseComponent(target?: Pick<SceneObject, "id" | "name">): MotionPulseComponent {
  return {
    ...defaultMotionPulseComponent,
    targets: [createMotionPulseTarget(target, 0)],
  };
}

export function normalizeMotionPulseComponent(component: MotionPulseComponent | undefined): MotionPulseComponent {
  if (!component) return defaultMotionPulseComponent;
  return {
    enabled: component.enabled !== false,
    targets: component.targets ?? [],
  };
}

function parseTarget(raw: any, index: number): MotionPulseTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const easing = EASINGS.has(raw.easing) ? raw.easing : "linear";
  const mode = MODES.has(raw.mode) ? raw.mode : "loop";
  const axisMode = AXIS_MODES.has(raw.axis_mode) ? raw.axis_mode : AXIS_MODES.has(raw.axisMode) ? raw.axisMode : "individual";
  return {
    id: typeof raw.id === "string" && raw.id
      ? raw.id
      : createDeterministicAuthoredId(
          "pulse-target-legacy",
          `${index}:${String(raw.object_id ?? raw.objectId ?? "")}:${String(raw.name ?? "")}`,
        ),
    objectId: typeof raw.object_id === "string" ? raw.object_id : typeof raw.objectId === "string" ? raw.objectId : undefined,
    name: typeof raw.name === "string" && raw.name ? raw.name : `Target ${index + 1}`,
    enabled: raw.enabled !== false,
    mode,
    axisMode,
    rate: Math.max(0, finiteNumber(raw.rate, 1)),
    phase: finiteNumber(raw.phase, 0),
    easing,
    position: parseVec3(raw.position),
    rotation: parseVec3(raw.rotation),
    scale: parseVec3(raw.scale),
  };
}

export function parseMotionPulseComponent(raw: any): MotionPulseComponent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    enabled: raw.enabled !== false,
    targets: Array.isArray(raw.targets)
      ? raw.targets.flatMap((target: unknown, index: number) => {
          const parsed = parseTarget(target, index);
          return parsed ? [parsed] : [];
        })
      : [],
  };
}

export function serializeMotionPulseComponent(component: MotionPulseComponent | undefined) {
  if (!component) return null;
  return {
    enabled: component.enabled !== false,
    targets: (component.targets ?? []).map((target) => ({
      id: target.id,
      object_id: target.objectId ?? null,
      name: target.name,
      enabled: target.enabled !== false,
      mode: target.mode,
      axis_mode: target.axisMode,
      rate: target.rate,
      phase: target.phase,
      easing: target.easing,
      position: target.position,
      rotation: target.rotation,
      scale: target.scale,
    })),
  };
}

export function motionPulseEasingProgress(easing: MotionPulseEasing, value: number): number {
  const t = Math.min(Math.max(value, 0), 1);
  switch (easing) {
    case "smooth":
      return t * t * (3 - 2 * t);
    case "easeIn":
      return t * t * t;
    case "easeOut":
      return 1 - (1 - t) ** 3;
    case "easeInOut":
      return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
    case "linear":
    default:
      return t;
  }
}
