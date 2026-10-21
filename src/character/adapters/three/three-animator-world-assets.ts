import * as THREE from "three";
import type { SceneObject } from "../../../scene/domain/scene-object";
import { createAssetCache } from "../../../three/assets";
import { cloneImportedAsset } from "../../../three/resources/imported-asset-lifetime";
import { disposeObject } from "../../../three/dispose";
import { versionedModelAssetUrl } from "../../../lib/model-import-settings";
import { primitiveForFilename } from "../../../assets/import-support";
import type { AnimatorPlaybackAssets } from "../../application/playback/animator-playback-contracts";
import { characterRuntimeFailure, characterRuntimeSuccess, type CharacterRuntimeResult } from "../../runtime/diagnostics";
import type { ThreeAnimatorClipResource } from "./three-animator-clip-resource";
import { createThreeAnimatorPlaybackAssetResolver, type ThreeAnimatorPlaybackCatalog } from "./three-animator-playback-resolver";
import { createThreeAnimatorPlaybackModelSnapshot } from "./three-animator-playback-model-snapshot";
import { scanThreeCharacterModelWork } from "./three-character-model-work-limits";

export type ThreeAnimatorWorldRig = Readonly<{
  node: THREE.Group;
  body: THREE.Object3D;
  assets: AnimatorPlaybackAssets<ThreeAnimatorClipResource>;
  dispose: () => void;
}>;
export type ThreeAnimatorWorldAssets = Readonly<{
  load: (object: SceneObject) => Promise<CharacterRuntimeResult<ThreeAnimatorWorldRig>>;
  dispose: () => void;
}>;

/** Owns target clones and asset leases independently of every render viewport. */
export function createThreeAnimatorWorldAssets(objects: readonly SceneObject[], catalog: ThreeAnimatorPlaybackCatalog, sceneObjects: readonly SceneObject[] = objects): ThreeAnimatorWorldAssets {
  const owner = { assetCache: createAssetCache(), disposed: false };
  const snapshot = createThreeAnimatorPlaybackModelSnapshot({ runtime: owner, assets: catalog.importedAssets, objects, library: catalog.library });
  const resolver = createThreeAnimatorPlaybackAssetResolver({ runtime: owner, catalog, objects, modelSnapshot: snapshot });
  const rigs = new Set<ThreeAnimatorWorldRig>();
  const byId = new Map(sceneObjects.map((object) => [object.id, object]));
  return {
    async load(object) {
      const guid = object.assetRef?.guid.toLowerCase();
      const asset = guid ? snapshot.models.get(guid) : undefined;
      const document = guid ? await snapshot.settings.get(guid) : undefined;
      if (owner.disposed) return characterRuntimeFailure("disposed-animator-world", "Animation world was stopped during asset loading.");
      if (!asset || !document?.value) return characterRuntimeFailure(document?.diagnostics ?? [{ code: "missing-animator-target-model", severity: "error", message: `Animator ${object.name} needs an imported target model.` }]);
      const lease = owner.assetCache.acquire(versionedModelAssetUrl(asset.url, document.value.importVersion), primitiveForFilename(asset.filename));
      let body: THREE.Object3D | null = null;
      let retained = false;
      try {
        const source = await lease.value;
        if (owner.disposed) return characterRuntimeFailure("disposed-animator-world", "Animation world was stopped during model loading.");
        const scan = scanThreeCharacterModelWork(source.object);
        if (!scan.accepted) return characterRuntimeFailure(scan.diagnostics);
        body = cloneImportedAsset(lease, source);
        body.userData.animationClips = source.animations;
        const node = new THREE.Group();
        node.position.fromArray(object.position);
        node.rotation.set(...object.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
        node.scale.fromArray(object.scale);
        node.visible = object.visible;
        node.add(body);
        const ancestors = new Set([object.id]);
        let parentId = object.parentId, child: THREE.Object3D = node;
        while (parentId) {
          if (ancestors.has(parentId)) throw new Error("Animator parent hierarchy contains a cycle.");
          ancestors.add(parentId);
          const parent = byId.get(parentId);
          if (!parent) throw new Error(`Animator parent ${parentId} is missing.`);
          const parentNode = new THREE.Group();
          parentNode.position.fromArray(parent.position);
          parentNode.rotation.set(...parent.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
          parentNode.scale.fromArray(parent.scale);
          parentNode.visible = parent.visible;
          parentNode.add(child); child = parentNode; parentId = parent.parentId;
        }
        child.updateMatrixWorld(true);
        const resolved = await resolver.resolve(object, body);
        if (!resolved.value || owner.disposed) return { value: null, diagnostics: resolved.diagnostics };
        const ownedBody = body;
        let disposed = false;
        const rig: ThreeAnimatorWorldRig = { node, body, assets: resolved.value, dispose() {
          if (disposed) return;
          disposed = true; rigs.delete(rig);
          try { disposeObject(ownedBody); } finally { lease.release(); node.clear(); }
        } };
        rigs.add(rig); body = null; retained = true;
        return characterRuntimeSuccess(rig, resolved.diagnostics);
      } finally {
        try { if (body) disposeObject(body); } finally { if (!retained) lease.release(); }
      }
    },
    dispose() {
      if (owner.disposed) return;
      owner.disposed = true;
      const errors: unknown[] = [];
      for (const rig of rigs) { try { rig.dispose(); } catch (error) { errors.push(error); } }
      try { resolver.dispose(); } catch (error) { errors.push(error); }
      try { owner.assetCache.dispose(); } catch (error) { errors.push(error); }
      if (errors.length) throw new Error(`Animation world asset cleanup failed: ${errors.map(String).join("; ")}`);
    },
  };
}
