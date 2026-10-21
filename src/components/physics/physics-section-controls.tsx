import type { SceneObject, Vec3 } from "../../types";
import { EditorIcon } from "../../ui/EditorIcon";

export type UpdateObject = (id: string, patch: Partial<SceneObject>) => void;

export function patchPhysicsVector(values: Vec3, axis: number, value: number, min = -Infinity): Vec3 {
  const next = [...values] as Vec3;
  next[axis] = Math.max(min, Number.isFinite(value) ? value : values[axis]);
  return next;
}

export function RemovePhysicsComponentButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button className="icon-button danger" type="button" title={title} onClick={onClick}>
      <EditorIcon name="delete" size="control" />
    </button>
  );
}
