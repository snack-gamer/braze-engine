import {
  defaultFalloffCurve,
} from "../../lib/effector";
import type {
  EffectorCurveKey,
  EffectorSettings,
} from "../domain/effector";
import type { SceneObject } from "../domain/scene-object";
import type { Vec3 } from "../domain/scene-values";

export type EffectorVectorKey = keyof Pick<
  EffectorSettings,
  | "boxSize" | "positionAmount" | "rotationAmount" | "scaleAmount"
  | "customUp" | "relativeScale" | "coordinateOffset" | "movement"
>;

export const EFFECTOR_FALLOFF_PRESETS: Array<{
  id: string;
  label: string;
  keys: EffectorCurveKey[];
}> = [
  { id: "smooth", label: "Smooth", keys: defaultFalloffCurve },
  {
    id: "linear",
    label: "Linear",
    keys: [
      { time: 0, value: 1, inTangent: -1, outTangent: -1 },
      { time: 1, value: 0, inTangent: -1, outTangent: -1 },
    ],
  },
  {
    id: "constant",
    label: "Solid",
    keys: [
      { time: 0, value: 1, inTangent: 0, outTangent: 0 },
      { time: 1, value: 1, inTangent: 0, outTangent: 0 },
    ],
  },
];

export function effectorFalloffPresetId(keys: readonly EffectorCurveKey[]): string {
  for (const preset of EFFECTOR_FALLOFF_PRESETS) {
    if (
      preset.keys.length === keys.length
      && preset.keys.every((key, index) =>
        Math.abs(key.time - keys[index].time) < 1e-6
        && Math.abs(key.value - keys[index].value) < 1e-6
        && Math.abs(key.inTangent - keys[index].inTangent) < 1e-6
        && Math.abs(key.outTangent - keys[index].outTangent) < 1e-6)
    ) return preset.id;
  }
  return "custom";
}

export function cloneEffectorFalloffPreset(presetId: string): EffectorCurveKey[] | null {
  const preset = EFFECTOR_FALLOFF_PRESETS.find((item) => item.id === presetId);
  return preset ? preset.keys.map((key) => ({ ...key })) : null;
}

export function patchEffectorVector(
  effector: EffectorSettings,
  key: EffectorVectorKey,
  axis: number,
  value: number,
): Partial<EffectorSettings> {
  const next = [...effector[key]] as Vec3;
  next[axis] = value;
  return { [key]: next } as Partial<EffectorSettings>;
}

export function effectorTargetCandidates(
  objects: readonly SceneObject[],
  effectorId: string,
): SceneObject[] {
  return objects.filter((object) => object.id !== effectorId && object.primitive !== "effector");
}

export function effectorClonerUsageCount(
  objects: readonly SceneObject[],
  effectorId: string,
): number {
  return objects.filter(
    (object) => object.primitive === "cloner" && (object.cloner?.effectorIds ?? []).includes(effectorId),
  ).length;
}

export function effectorShapeFields(shape: EffectorSettings["shape"]): {
  hasHeight: boolean;
  hasRadius: boolean;
} {
  const hasHeight = shape === "capsule" || shape === "cylinder" || shape === "cone";
  return { hasHeight, hasRadius: shape === "sphere" || hasHeight };
}
