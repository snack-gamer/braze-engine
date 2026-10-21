import * as THREE from "three";
import { createAssetCache, createAssetResourcePool, loadAndPrepareAsset } from "../../../three/assets";
import { cloneImportedAsset } from "../../../three/resources/imported-asset-lifetime";
import { disposeObject } from "../../../three/dispose";
import { applyMaterialsToBody } from "../../../three/material-display";
import { awaitMaterialTextures } from "../../../three/texture-cache";
import type { RuntimePrefabResourceCatalog } from "../runtime-prefab-resource-catalog";
import type { WorldEntity } from "../../../world/domain/entity-world";
import { EntityWorldError } from "../../../world/domain/entity-world";
import type { SceneObject } from "../../../scene/domain/scene-object";
import { scanThreeCharacterModelWork } from "../../../character/adapters/three/three-character-model-work-limits";

/** A world's source leases and per-instance material owners; views only borrow them. */
export function createRuntimeModelAssets(catalog: RuntimePrefabResourceCatalog) {
  const byUrl = new Map([...catalog.models.values()].map((model) => [model.url, model]));
  const pool = createAssetResourcePool((url, primitive) => loadAndPrepareAsset(url, primitive, byUrl.get(url)!.settings, true));
  const cache = createAssetCache(pool);
  let disposed = false;
  return {
    async prepare(entity: WorldEntity, signal: AbortSignal): Promise<THREE.Object3D> {
      const model = entity.model!, resource = catalog.models.get(model.asset.guid);
      if (!resource) throw new EntityWorldError("missing-asset", `${entity.name}: model is absent from this Play catalog.`);
      const lease = cache.acquire(resource.url, resource.primitive);
      let object: THREE.Object3D | undefined;
      try {
        const source = await lease.value;
        if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Model preparation was cancelled.");
        let meshes = 0, vertices = 0;
        const slots = new Set<string>();
        source.object.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if ((node as THREE.SkinnedMesh).isSkinnedMesh && !model.animator?.enabled) throw new EntityWorldError("unsupported-component", `${entity.name}: skinned runtime models require an enabled Animator.`);
          if ((node as THREE.Light).isLight || (node as THREE.Camera).isCamera) throw new EntityWorldError("unsupported-component", `${entity.name}: disable imported lights/cameras for runtime prefabs.`);
          if ((node as THREE.Line).isLine || (node as THREE.Points).isPoints || (node as THREE.InstancedMesh).isInstancedMesh) throw new EntityWorldError("unsupported-component", `${entity.name}: runtime models require ordinary mesh surfaces.`);
          if (!mesh.isMesh) return;
          meshes++; vertices += mesh.geometry.getAttribute("position")?.count ?? 0;
          for (const slot of mesh.userData.tganMaterialSlotKeys ?? []) slots.add(slot);
        });
        if (!meshes || meshes > 128 || vertices > 1_000_000) throw new EntityWorldError("capacity", `${entity.name}: runtime models require 1–128 meshes and at most 1,000,000 vertices.`);
        if (model.animator?.enabled) {
          const scan = scanThreeCharacterModelWork(source.object);
          if (!scan.accepted) throw new EntityWorldError("capacity", `${entity.name}: ${scan.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
        }
        for (const binding of model.bindings) if (!slots.has(binding.slotKey)) throw new EntityWorldError("missing-asset", `${entity.name}: imported material slot '${binding.slotKey}' no longer exists.`);
        for (const id of [model.materialId, ...model.bindings.map((binding) => binding.materialId)]) if (id && !catalog.materials.has(id)) throw new EntityWorldError("missing-asset", `${entity.name}: material '${id}' is missing.`);
        object = cloneImportedAsset(lease, source);
        object.userData.animationClips = source.animations;
        const descriptor: SceneObject = { id: "runtime", name: entity.name, primitive: resource.primitive, visible: true, locked: false,
          color: "#ffffff", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materialId: model.materialId, importedMaterialBindings: [...model.bindings] };
        applyMaterialsToBody(object, descriptor, catalog.materials.get(model.materialId ?? "") ?? null, [...catalog.materials.values()]);
        const pending: Promise<void>[] = [];
        object.traverse((node) => {
          const mesh = node as THREE.Mesh; if (!mesh.isMesh) return;
          mesh.castShadow = model.castShadows; mesh.receiveShadow = model.receiveShadows;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) pending.push(awaitMaterialTextures(material));
        });
        await Promise.all(pending);
        if (disposed || signal.aborted) throw new EntityWorldError("world-ended", "Model preparation was cancelled.");
        return object;
      } catch (error) {
        if (object) disposeObject(object); else lease.release();
        if (disposed) pool.cache.clearUnused();
        throw error;
      }
    },
    dispose() { if (disposed) return; disposed = true; cache.dispose(); pool.cache.clearUnused(); },
    collect() { if (disposed) pool.cache.clearUnused(); },
    diagnostics: () => pool.cache.diagnostics(),
  };
}
