import type { PrimitiveKind, SceneObject } from "../types";
import { isAvatarBotObject } from "./bots";

// Primitive kinds drawn as a mesh — these carry the default Mesh Filter +
// Mesh Renderer components.
export const MESH_PRIMITIVES = new Set<PrimitiveKind>([
  "cube",
  "sphere",
  "plane",
  "fbx",
  "usdz",
  "usd",
  "gltf",
]);

// True for objects that render as a shaded mesh (and therefore own Mesh Filter
// + Mesh Renderer). Water surfaces and avatar bots draw through their own paths
// and are excluded — mirrors the inspector's `showMaterial` gate.
export function isMeshRenderObject(object: SceneObject): boolean {
  return MESH_PRIMITIVES.has(object.primitive) && !object.water && !isAvatarBotObject(object);
}

// Ids for the removable default components (opt-out). Wireframe is opt-in and
// tracked by its own presence, so it is not listed here.
export type RemovableComponentId = "meshFilter" | "meshRenderer" | "spriteRenderer";

export function isComponentRemoved(object: SceneObject, id: RemovableComponentId): boolean {
  return object.removedComponents?.includes(id) ?? false;
}

// Patch that removes a default component (adds it to removedComponents).
export function removeComponentPatch(object: SceneObject, id: RemovableComponentId): Partial<SceneObject> {
  const current = object.removedComponents ?? [];
  if (current.includes(id)) return {};
  return { removedComponents: [...current, id] };
}

// Patch that restores a previously-removed default component.
export function restoreComponentPatch(object: SceneObject, id: RemovableComponentId): Partial<SceneObject> {
  const current = object.removedComponents ?? [];
  if (!current.includes(id)) return {};
  const next = current.filter((entry) => entry !== id);
  return { removedComponents: next.length > 0 ? next : undefined };
}
