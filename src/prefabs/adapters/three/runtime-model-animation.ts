import * as THREE from "three";
import { createAuthoredId } from "../../../identity/authored-id";
import { createAssetCache } from "../../../three/assets";
import { cloneImportedAsset } from "../../../three/resources/imported-asset-lifetime";
import { disposeObject } from "../../../three/dispose";
import type { Runtime } from "../../../three/runtime";
import type { SceneObject } from "../../../scene/domain/scene-object";
import type { BrowserThreeWebGpuRenderSession } from "../../../rendering/adapters/browser-three-webgpu-session";
import { animatorWorldForSession } from "../../../character/adapters/three/shared-animator-world";
import { createThreeAnimatorPlaybackAssetResolver } from "../../../character/adapters/three/three-animator-playback-resolver";
import type { ThreeAnimatorWorldRig } from "../../../character/adapters/three/three-animator-world-assets";
import { hasCharacterRuntimeErrors } from "../../../character/runtime/diagnostics";
import { defaultRigidbodyForObject } from "../../../physics/authoring/component-defaults";
import { EntityWorldError } from "../../../world/domain/entity-world";
import type { PreparedEntityChange } from "../../../world/runtime/entity-world";
import type { RuntimePrefabSource } from "../../domain/runtime-prefab";
import { decodePrefabDocument } from "../../serialization/prefab-document";
import type { RuntimePrefabResourceCatalog } from "../runtime-prefab-resource-catalog";
import type { RuntimeModelRecord } from "./runtime-model-views";
import type { RuntimeAnimatorCreation } from "../../../character/adapters/three/three-animator-runtime-contracts";
import { physicsWorldForSession } from "../../../three/physics/shared-physics-world";

export type RuntimeModelAnimation = Readonly<{
  prepare: (created: readonly RuntimeModelRecord[], removed: readonly RuntimeModelRecord[], signal: AbortSignal) => Promise<PreparedEntityChange | undefined>;
  attach: (record: RuntimeModelRecord, runtime: Runtime, node: THREE.Group, body: THREE.Object3D) => (() => void) | undefined;
  dispose: () => void;
}>;

/** Resolves captured prefab animation resources; the existing world owns each admitted controller. */
export function createRuntimeModelAnimation(catalog: RuntimePrefabResourceCatalog, sources: readonly RuntimePrefabSource[], renderSession: BrowserThreeWebGpuRenderSession): RuntimeModelAnimation {
  const owner = { assetCache: createAssetCache(), disposed: false };
  const captured = catalog.animation;
  const objects = sources.flatMap((source) => decodePrefabDocument(source.document, { name: source.name, filename: source.asset.guid }).objects)
    .filter((object) => object.animator?.enabled);
  const resolver = captured ? createThreeAnimatorPlaybackAssetResolver({
    runtime: owner, catalog: { importedAssets: captured.importedAssets, library: captured.characterAssets }, objects,
    loadModelImport: async (filename) => {
      const document = captured.modelImportDocuments[filename];
      if (!document) throw new EntityWorldError("missing-asset", `Animator importer snapshot '${filename}' is missing.`);
      return document;
    },
  }) : null;
  const activeIds = new Set<string>();
  const active = (signal: AbortSignal) => {
    if (owner.disposed || signal.aborted) throw new EntityWorldError("world-ended", "Runtime Animator preparation was cancelled.");
  };
  return {
    async prepare(created, removed, signal) {
      const requested = created.filter((record) => record.entity.model?.animator?.enabled);
      const removedCandidates = removed.flatMap((record) => record.animationId ? [record.animationId] : []);
      if (!requested.length && !removedCandidates.length) return;
      active(signal);
      const world = animatorWorldForSession(renderSession);
      if (!world) throw new EntityWorldError("missing-dependency", "The runtime animation world is unavailable.");
      // A faulted Animator has already retired; its model/entity can still be destroyed.
      const removedIds = removedCandidates.filter((id) => world.runtimeEntity(id));
      const retainedRemovedIds = removedCandidates.filter((id) => activeIds.has(id));
      if (requested.length && !resolver) throw new EntityWorldError("missing-asset", "The runtime prefab has no captured Animator resources.");
      const prepared: RuntimeAnimatorCreation[] = [];
      let transferred = false;
      try {
        for (const record of requested) {
          active(signal);
          const id = createAuthoredId("runtime-animator");
          const object = animationObject(record, id, catalog);
          const animations = record.object.userData.animationClips as THREE.AnimationClip[] | undefined;
          const body = cloneImportedAsset({ value: Promise.resolve({ object: record.object, animations: animations ?? [] }), release() {} }, { object: record.object, animations: animations ?? [] });
          body.userData.animationClips = animations ?? [];
          const node = new THREE.Group();
          node.position.fromArray(object.position);
          node.rotation.set(...object.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
          node.scale.fromArray(object.scale); node.add(body); node.updateMatrixWorld(true);
          let retained = false;
          try {
            const resolved = await resolver!.resolve(object, body);
            active(signal);
            if (!resolved.value || hasCharacterRuntimeErrors(resolved.diagnostics)) throw new EntityWorldError("missing-asset", `${record.entity.name}: ${resolved.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
            let disposed = false;
            const rig: ThreeAnimatorWorldRig = { node, body, assets: resolved.value, dispose() {
              if (disposed) return; disposed = true; disposeObject(body); node.clear();
            } };
            prepared.push({ object, rig, entity: record.entity.handle,
              ...(record.entity.character ? { rootMotionSink: { applyRootMotion(application) {
                if (owner.disposed) throw new EntityWorldError("world-ended", "Runtime Character Animator has ended.");
                // Physics publication follows model preparation. Resolve the live
                // motor at application time and retain only the generation handle.
                const motor = physicsWorldForSession(renderSession)?.runtimeCharacterMotorFor(record.entity.handle);
                if (!motor) throw new EntityWorldError("stale-handle", "Runtime Character motor is unavailable.");
                motor.applyRootMotion(application);
              } } } : {}),
            });
            record.animationId = id; retained = true;
          } finally { if (!retained) { disposeObject(body); node.clear(); } }
        }
        active(signal);
        // The animation transaction takes rig ownership, including rejected preparation.
        transferred = true;
        const change = world.prepareRuntimeChange(prepared, removedIds);
        let published = false;
        return {
          publish() {
            change.publish(); published = true;
            for (const { object } of prepared) activeIds.add(object.id);
            for (const id of removedCandidates) activeIds.delete(id);
          },
          rollback() {
            change.rollback();
            if (published) {
              for (const { object } of prepared) activeIds.delete(object.id);
              for (const id of retainedRemovedIds) activeIds.add(id);
            }
          },
          retire: change.retire,
        };
      } finally { if (!transferred) for (const { rig } of prepared) rig.dispose(); }
    },
    attach(record, runtime, node, body) {
      if (!record.animationId) return;
      const world = animatorWorldForSession(renderSession);
      if (!world || owner.disposed) throw new EntityWorldError("world-ended", "The runtime animation world has ended.");
      return world.attachRuntimeView(record.animationId, runtime, node, body);
    },
    dispose() {
      if (owner.disposed) return;
      owner.disposed = true;
      const errors: unknown[] = [];
      const cleanup = (action: () => void) => { try { action(); } catch (error) { errors.push(error); } };
      cleanup(() => {
        const world = animatorWorldForSession(renderSession);
        const ids = [...activeIds].filter((id) => world?.runtimeEntity(id));
        activeIds.clear();
        if (world && ids.length) {
          const change = world.prepareRuntimeChange([], ids); change.publish(); change.retire();
        }
      });
      cleanup(() => resolver?.dispose()); cleanup(() => owner.assetCache.dispose());
      if (errors.length) throw new Error(`Runtime Animator resource cleanup failed: ${errors.map(String).join("; ")}`);
    },
  };
}

function animationObject(record: RuntimeModelRecord, id: string, catalog: RuntimePrefabResourceCatalog): SceneObject {
  const { entity } = record, model = entity.model!, resource = catalog.models.get(model.asset.guid)!;
  const transform = model.worldTransform;
  const object: SceneObject = { id, name: entity.name, primitive: resource.primitive, assetRef: model.asset,
    position: [...transform.position], rotation: [...transform.rotation], scale: [...transform.scale],
    color: "#ffffff", visible: true, locked: false, animator: model.animator };
  if (entity.primitive || entity.character) object.rigidbody = { ...defaultRigidbodyForObject(object), enabled: true,
    bodyType: entity.character ? "kinematic" : "dynamic" };
  return object;
}
