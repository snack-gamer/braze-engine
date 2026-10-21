import type { PrefabDocument } from "../domain/prefab-document";
import { EntityWorldError } from "../../world/domain/entity-world";
import { captureEntityTransform } from "../../world/domain/entity-transform";
import { normalizeCollider, normalizeRigidbody } from "../../physics/authoring/component-defaults";
import { validateRuntimePrefabCharacter } from "./runtime-prefab-character";

const fields = new Set(["id", "name", "tags", "behaviors", "primitive", "color", "visible", "locked", "transformLocked", "renderVisible", "position", "rotation", "scale", "parentId",
  "assetRef", "assetUrl", "assetName", "assetNote", "assetMissing", "materialId", "importedMaterialBindings", "rowColor", "rowColorEnabled", "meshFilter", "meshRenderer", "rigidbody", "colliders", "dimension", "animator", "characterController"]);

/** Explicit subset: reject unsupported active data before allocating any entities. */
export function validateRuntimePrefab(document: PrefabDocument) {
  const fail = (id: string, message: string): never => { throw new EntityWorldError("unsupported-component", `${document.name} / ${id}: ${message}`); };
  if (document.objects.length > 128 || document.rootIds.length !== 1) fail(document.name, "Runtime prefabs require one root and at most 128 nodes.");
  const objects = document.objects, byId = new Map(objects.map((object) => [object.id, object]));
  const rootId = document.rootIds[0];
  if (byId.get(rootId)?.parentId || byId.get(rootId)?.primitive !== "transform") fail(rootId, "Use a Transform master root.");
  for (const object of objects) {
    if (object.id.length > 256 || !object.name || object.name.length > 256) fail(object.id, "Names and node IDs must fit 256 characters.");
    captureEntityTransform(object);
    for (const key of Object.keys(object)) if (!fields.has(key) && object[key as keyof typeof object] !== undefined) fail(object.id, `Runtime prefab component/property '${key}' is not supported yet.`);
    if (!object.visible || object.dimension === "2d") fail(object.id, "Only visible 3D nodes are supported.");
    const seen = new Set<string>(); let current = object;
    while (current.id !== rootId) {
      if (seen.has(current.id)) fail(object.id, "Hierarchy cycle."); seen.add(current.id);
      const parent = byId.get(current.parentId ?? "");
      if (!parent) return fail(object.id, "Every node must belong to the saved master root.");
      if (parent.primitive !== "transform") fail(object.id, "Dynamic bodies cannot own child nodes in this checkpoint.");
      current = parent;
    }
    if (object.primitive === "transform") {
      if (object.animator) fail(object.id, "Animator requires an imported model leaf.");
      if (object.characterController?.enabled) fail(object.id, "Runtime Character Controller requires a cube, sphere or imported model leaf.");
      if (object.assetRef || object.materialId || object.importedMaterialBindings?.length) fail(object.id, "Transform groups cannot carry model/material references.");
      if (object.rigidbody || object.colliders?.length || object.meshFilter || object.meshRenderer) fail(object.id, "Transform groups cannot carry physics or mesh components yet.");
      continue;
    }
    const model = ["gltf", "fbx", "usdz"].includes(object.primitive);
    if (object.animator && !model) fail(object.id, "Animator requires an imported model leaf.");
    if (model && object.animator?.enabled && object.rigidbody?.enabled !== false && object.rigidbody?.bodyType !== "kinematic" && object.rigidbody
      && object.animator.rootMotion.mode === "applyToObject") fail(object.id, "Dynamic model Animator root motion cannot apply to a GPU body; use disabled or extractOnly.");
    if (!model && (object.materialId || object.importedMaterialBindings?.length)) fail(object.id, "Material overrides currently require an imported model.");
    if (!model && !["cube", "sphere"].includes(object.primitive)) fail(object.id, `Runtime prefab primitive '${object.primitive}' is not supported yet.`);
    if (object.renderVisible === false || object.meshFilter?.enabled === false || object.meshRenderer?.enabled === false
      || (!model && (object.meshRenderer?.castShadows === false || object.meshRenderer?.receiveShadows === false))) fail(object.id, "Runtime primitives currently require enabled mesh rendering and shadows.");
    if (object.characterController?.enabled) { validateRuntimePrefabCharacter(object); continue; }
    if (model && !object.rigidbody && !object.colliders?.length) continue;
    if (!object.rigidbody) fail(object.id, "Add an enabled dynamic Rigidbody and one box or sphere Collider.");
    const rigidbody = normalizeRigidbody(object.rigidbody);
    if (!rigidbody.enabled || rigidbody.bodyType !== "dynamic" || rigidbody.interpolation !== "none") fail(object.id, object.characterController?.enabled === false && rigidbody.bodyType === "kinematic"
      ? "Enable the Character Controller before spawning its kinematic capsule."
      : "Use an enabled dynamic Rigidbody with interpolation None.");
    if (!Array.isArray(object.colliders) || object.colliders.length !== 1) return fail(object.id, "Exactly one enabled box or sphere Collider is supported.");
    const collider = normalizeCollider(object.colliders[0], object);
    if (!collider.enabled || !["box", "sphere"].includes(collider.shape) || collider.geometry) fail(object.id, "Use an enabled box or sphere Collider.");
  }
  return rootId;
}
