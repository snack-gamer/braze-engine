import { captureRuntimePrefabResourceCatalog } from "./runtime-prefab-resource-catalog";
import { validateRuntimePrefabAnimator } from "./runtime-prefab-animator-validation";
import { captureRuntimeModel } from "../../world/domain/runtime-model";
import { Euler, Quaternion, MathUtils } from "three";
import { decodePrefabDocument } from "../serialization/prefab-document";
import { validateRuntimePrefab } from "./runtime-prefab-validation";
import type { PrefabPlacement, RuntimePrefabSource } from "../domain/runtime-prefab";
import type { RuntimePrefabTemplate } from "../runtime/runtime-prefabs";
import type { SceneObject } from "../../scene/domain/scene-object";
import { PRIMITIVE_CUBE_SIZE, PRIMITIVE_SPHERE_RADIUS } from "../../scene/domain/primitive-dimensions";
import { EntityWorldError, type EntityCommand } from "../../world/domain/entity-world";
import { captureEntityTransform } from "../../world/domain/entity-transform";
import { captureRuntimePrimitive, type RuntimeVector3 } from "../../world/domain/runtime-primitive";
import { compileAuthoredPhysicsScene } from "../../physics/authoring/scene-compiler";
import { compileRigidWorld } from "../../physics/authoring/rigid-world-compiler";
import { compileHierarchyWorldTransforms } from "../../physics/authoring/hierarchy-world";
import { DEFAULT_PHYSICS_WORLD_SETTINGS, type PhysicsWorldSettings } from "../../physics/domain/world-settings";
import { compileRuntimePrefabCharacter } from "./runtime-prefab-character";

/** Cold snapshot/instantiation work only. The live renderer never walks this graph. */
export function compileRuntimePrefabLibrary(sources: readonly RuntimePrefabSource[], settings: PhysicsWorldSettings = DEFAULT_PHYSICS_WORLD_SETTINGS): readonly RuntimePrefabTemplate[] {
  if (!Array.isArray(sources) || sources.length > 32) throw new EntityWorldError("capacity", "A runtime prefab catalog supports at most 32 saved assets.");
  const resources = captureRuntimePrefabResourceCatalog(sources);
  const ids = new Set<string>();
  return Object.freeze(sources.map((source) => {
    const guid = source.asset?.guid?.toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(guid ?? "") || ids.has(guid) || (source.asset.localId !== undefined && source.asset.localId !== "main")) throw new EntityWorldError("invalid-command", "Invalid or duplicate prefab AssetRef.");
    ids.add(guid);
    if (typeof source.revision !== "string" || !source.revision || source.revision.length > 256) throw new EntityWorldError("invalid-command", "Saved prefabs require a revision.");
    const document = decodePrefabDocument(structuredClone(source.document), { name: source.name, filename: guid });
    const rootKey = validateRuntimePrefab(document);
    document.objects.forEach((object) => validateRuntimePrefabAnimator(object, resources));
    const create = (placement: PrefabPlacement = {}): readonly EntityCommand[] => {
      const objects = document.objects.map((object): SceneObject => {
        if (object.id !== rootKey) return object;
        const transform = captureEntityTransform({ position: placement.position ?? object.position, rotation: placement.rotation ?? object.rotation, scale: placement.scale ?? object.scale });
        return { ...object, position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale] };
      });
      const poses = compileHierarchyWorldTransforms(objects);
      const compiled = compileAuthoredPhysicsScene(objects, `prefab:${guid}`, settings);
      const bodies = new Map(compileRigidWorld(compiled).bodies.map((body) => [body.binding.objectId, body]));
      const authored = new Map(compiled.bodies.map((body) => [body.objectId, body]));
      return objects.map((object): EntityCommand => {
        const transform = captureEntityTransform(object), pose = poses.get(object.id)!;
        if (pose.hasShear) throw new EntityWorldError("invalid-command", `${object.name}: sheared prefab transforms are unsupported.`);
        const base = { op: "create" as const, key: object.id, name: object.name, tags: object.tags, behaviors: object.behaviors, parentKey: object.parentId, transform };
        if (object.primitive === "transform") return base;
        const imported = ["gltf", "fbx", "usdz"].includes(object.primitive);
        const rotation = new Euler().setFromQuaternion(new Quaternion(...pose.orientation));
        let worldRotation = [rotation.x, rotation.y, rotation.z].map(MathUtils.radToDeg) as unknown as RuntimeVector3;
        const body = bodies.get(object.id), original = authored.get(object.id);
        if (object.primitive === "sphere" && Math.max(...pose.scale) - Math.min(...pose.scale) > Math.max(...pose.scale) * 1e-5) throw new EntityWorldError("invalid-command", `${object.name}: runtime spheres require uniform world scale.`);
        const character = object.characterController?.enabled ? compileRuntimePrefabCharacter(object, pose, body,
          imported ? undefined : { color: object.color, shape: object.primitive === "sphere"
            ? { kind: "sphere", radius: PRIMITIVE_SPHERE_RADIUS * pose.scale[0] }
            : { kind: "box", size: pose.scale.map((n) => n * PRIMITIVE_CUBE_SIZE) as unknown as RuntimeVector3 } }) : undefined;
        if (character) worldRotation = character.rotation!;
        const model = imported ? captureRuntimeModel({ asset: object.assetRef!,
          worldTransform: { position: pose.position, rotation: worldRotation, scale: pose.scale },
          materialId: object.materialId, bindings: object.importedMaterialBindings ?? [],
          castShadows: object.meshRenderer?.castShadows !== false, receiveShadows: object.meshRenderer?.receiveShadows !== false,
          ...(object.animator ? { animator: object.animator } : {}) }) : undefined;
        if (model) {
          if (resources.models.get(model.asset.guid)?.primitive !== object.primitive) throw new EntityWorldError("missing-asset", `${object.name}: model is absent from the captured resource catalog.`);
          for (const id of [model.materialId, ...model.bindings.map((binding) => binding.materialId)]) if (id && !resources.materials.has(id)) throw new EntityWorldError("missing-asset", `${object.name}: material '${id}' is missing.`);
          if (!object.rigidbody && !character) return { ...base, model };
        }
        if (character) return { ...base, model, character };
        if (!body || !original || (body.shape.kind !== "box" && body.shape.kind !== "sphere")) throw new EntityWorldError("unsupported-component", `${object.name}: expected one primitive body.`);
        return { ...base, model, primitive: captureRuntimePrimitive({
          shape: object.primitive !== "sphere" ? { kind: "box", size: pose.scale.map((n) => n * PRIMITIVE_CUBE_SIZE) as unknown as RuntimeVector3 }
            : { kind: "sphere", radius: PRIMITIVE_SPHERE_RADIUS * pose.scale[0] },
          position: pose.position, rotation: worldRotation,
          collider: { shape: body.shape.kind === "box" ? { kind: "box", size: body.shape.halfExtents.map((n) => n * 2) as unknown as RuntimeVector3 } : body.shape,
            center: original.collider.center.map((n, i) => n * pose.scale[i]) as unknown as RuntimeVector3 },
          mass: body.mass, color: object.color,
          physics: { useGravity: body.gravityScale !== 0, linearDamping: body.linearDamping, angularDamping: body.angularDamping,
            friction: body.friction, restitution: body.restitution, isTrigger: body.isTrigger, collisionLayer: body.collisionLayer, collisionMask: body.collisionMask },
        }) };
      });
    };
    create(); // Diagnose unsupported saved data before project create() can run.
    return Object.freeze({ asset: Object.freeze({ guid, localId: "main" }), name: document.name, revision: source.revision, nodes: document.objects.length, rootKey, create });
  }));
}
