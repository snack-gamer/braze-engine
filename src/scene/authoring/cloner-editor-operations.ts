import type { ClonerSettings } from "../domain/cloner";
import type { SceneObject } from "../domain/scene-object";
import type { Vec3 } from "../domain/scene-values";

export type ClonerVectorKey = keyof Pick<
  ClonerSettings,
  | "linearStep" | "linearRotation" | "linearScale" | "gridCount" | "gridSpacing"
  | "randomSize" | "radialRotationOffset" | "radialRotationStep"
  | "clonePosition" | "cloneRotation" | "cloneScale"
  | "jitterPosition" | "jitterRotation" | "jitterScale"
>;

export function clonerCloneCount(cloner: ClonerSettings): number {
  if (cloner.mode === "grid") {
    return Math.max(1, Math.round(cloner.gridCount[0]))
      * Math.max(1, Math.round(cloner.gridCount[1]))
      * Math.max(1, Math.round(cloner.gridCount[2]));
  }
  if (cloner.mode === "radial") {
    const rings = Math.max(1, cloner.radialRings);
    return rings * Math.max(1, cloner.count)
      + (Math.max(0, cloner.radialCountStep) * rings * (rings - 1)) / 2;
  }
  return cloner.count;
}

export function clonerInputCandidates(objects: readonly SceneObject[], ownerId: string): SceneObject[] {
  return objects.filter((object) =>
    object.id !== ownerId && object.primitive !== "camera" && object.primitive !== "cloner"
  );
}

export function clonerSourceCount(objects: readonly SceneObject[], ownerId: string): number {
  return objects.filter((object) => object.parentId === ownerId && object.primitive !== "camera").length;
}

export function patchClonerVector(
  cloner: ClonerSettings,
  key: ClonerVectorKey,
  axis: number,
  value: number,
  integer = false,
): Partial<ClonerSettings> {
  const next = [...cloner[key]] as Vec3;
  next[axis] = integer ? Math.max(1, Math.round(value)) : value;
  return { [key]: next } as Partial<ClonerSettings>;
}

export function uniformClonerVector(
  key: "jitterPosition" | "jitterRotation" | "jitterScale",
  value: number,
): Partial<ClonerSettings> {
  return { [key]: [value, value, value] } as Partial<ClonerSettings>;
}

export function clonerEffectorIds(
  objects: readonly SceneObject[],
  authoredIds: readonly string[],
): { stack: string[]; available: SceneObject[] } {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const stack = authoredIds.filter((id) => byId.get(id)?.primitive === "effector");
  const available = objects.filter((object) => object.primitive === "effector" && !stack.includes(object.id));
  return { stack, available };
}

export function moveClonerEffector(
  stack: readonly string[],
  index: number,
  delta: number,
): string[] | null {
  const target = index + delta;
  if (target < 0 || target >= stack.length) return null;
  const next = [...stack];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
