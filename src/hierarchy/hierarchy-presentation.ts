import { isComponentRemoved, isMeshRenderObject } from "../lib/components";
import type { ModifierKind, SceneObject } from "../types";
import type { EditorIconName } from "../ui/icons";
import type { EditorTone } from "../ui/tones";
import type { HierarchyRow } from "./hierarchy-model";
import { objectKindTone } from "../scene/presentation/object-kind-presentation";
import {
  sceneComponentPresentation,
  sceneComponentTone,
  type SceneComponentFamily,
  type SceneComponentPresentationId,
} from "../scene/presentation/scene-component-registry";

export type HierarchyComponentIndicator = {
  id: SceneComponentPresentationId;
  label: string;
  icon: EditorIconName;
  family: SceneComponentFamily;
  tone: EditorTone;
  count: number;
  enabled: boolean;
};

type ToggleComponentKey =
  | "wireframe"
  | "animator"
  | "animationPlayer"
  | "characterController"
  | "motionPulse"
  | "depthOfField"
  | "rigidbody";

const toggleComponents = [
  ["wireframe", "wireframe"],
  ["animator", "animator"],
  ["animationPlayer", "animationPlayer"],
  ["characterController", "characterController"],
  ["motionPulse", "motionPulse"],
  ["depthOfField", "depthOfField"],
  ["rigidbody", "rigidbody"],
] as const satisfies readonly (readonly [SceneComponentPresentationId, ToggleComponentKey])[];

/**
 * Object glyphs wear their group's tone. A prefab-instance root or imported
 * model is prefab blue and drawn solid, like Unity's outliner.
 */
export function hierarchyObjectTone(row: Pick<HierarchyRow, "object" | "prefabRoot">): EditorTone {
  return row.prefabRoot ? "prefab" : objectKindTone(row.object.primitive);
}

const modifierTypes = ["buoyancy", "displacer"] as const satisfies readonly ModifierKind[];

export function hierarchyComponentIndicators(object: SceneObject): HierarchyComponentIndicator[] {
  const states: Array<readonly [SceneComponentPresentationId, boolean, number?]> = [];
  const add = (id: SceneComponentPresentationId, enabled = true, count?: number) => {
    states.push([id, enabled, count]);
  };
  if (isMeshRenderObject(object)) {
    if (!isComponentRemoved(object, "meshFilter")) add("meshFilter", object.meshFilter?.enabled !== false);
    if (!isComponentRemoved(object, "meshRenderer")) {
      add("meshRenderer", object.meshRenderer?.enabled !== false && object.renderVisible !== false);
    }
  }
  if (object.dimension === "2d" && !isComponentRemoved(object, "spriteRenderer")) {
    add("spriteRenderer", object.spriteRenderer?.enabled !== false);
  }
  for (const [id, key] of toggleComponents) {
    const component = object[key];
    if (component) add(id, component.enabled !== false);
  }
  if (object.joint) add("joint", object.joint.enabled);
  if (object.uiCanvas) add("uiCanvas", object.uiCanvas.enabled && !object.uiCanvas.unavailable);
  if (object.behaviors) add("behaviors", !object.behaviors.unavailable && object.behaviors.entries.some((entry) => entry.enabled), object.behaviors.entries.length || 1);
  if (object.colliders?.length) {
    add("collider", object.colliders.some((collider) => collider.enabled !== false), object.colliders.length);
  }
  if (object.water) add("waterSurface");
  for (const type of modifierTypes) {
    const modifiers = (object.modifiers ?? []).filter((modifier) => modifier.type === type);
    if (modifiers.length) add(`modifier:${type}`, modifiers.some((modifier) => modifier.enabled), modifiers.length);
  }
  return states.map(([id, enabled, count]) => {
    const presentation = sceneComponentPresentation(id);
    return {
      id,
      label: presentation.label,
      icon: presentation.hierarchyIcon,
      family: presentation.family,
      tone: sceneComponentTone(id),
      count: count ?? 1,
      enabled,
    };
  });
}
