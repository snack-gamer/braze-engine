import * as THREE from "three";
import { assignThreeShadowCasterLayer } from "../../../rendering/adapters/three-webgpu/shadows/three-shadow-caster-layers";
import { markSceneDirty, type Runtime } from "../../../three/runtime";
import type { WorldEntity } from "../../../world/domain/entity-world";
import { cloneImportedAsset } from "../../../three/resources/imported-asset-lifetime";
import { disposeObject } from "../../../three/dispose";
import type { RuntimeModelAnimation } from "./runtime-model-animation";

export type RuntimeModelRecord = { entity: WorldEntity; object: THREE.Object3D; reservation?: symbol; animationId?: string };
export type RuntimeModelPoseBinder = (node: THREE.Object3D, entity: WorldEntity) => () => void;
type Attachment = { node: THREE.Group; restore?: () => void; detachAnimation?: () => void };

/** Cold attachment/removal only. Dynamic meshes read the world's GPU pose buffers directly. */
export function createRuntimeModelViews(bindPose: RuntimeModelPoseBinder, retire: () => Promise<void>, animation?: RuntimeModelAnimation) {
  const views = new Map<Runtime, Map<RuntimeModelRecord, Attachment>>();
  const attempt = (actions: Iterable<() => void>, errors: unknown[]) => {
    for (const action of actions) { try { action(); } catch (error) { errors.push(error); } }
  };
  const report = (errors: unknown[]) => { if (errors.length) throw new Error(`Runtime model view cleanup failed: ${errors.map(String).join("; ")}`); };
  const detachAnimation = (attachment: Attachment) => {
    const detach = attachment.detachAnimation; attachment.detachAnimation = undefined; detach?.();
  };
  const cleanup = (attachment: Attachment, errors: unknown[]) => {
    const restore = attachment.restore; attachment.restore = undefined;
    attempt([() => detachAnimation(attachment), () => restore?.(), () => disposeObject(attachment.node)], errors);
  };
  const create = (record: RuntimeModelRecord, runtime: Runtime): Attachment => {
    const node = new THREE.Group(), { entity, object } = record;
    node.name = `Runtime model: ${entity.name}`;
    node.userData.runtimeEntity = { slot: entity.handle.slot, generation: entity.handle.generation };
    const body = cloneImportedAsset({ value: Promise.resolve({ object, animations: [] }), release() {} }, { object, animations: [] });
    node.add(body);
    const transform = entity.model!.worldTransform;
    node.position.fromArray(transform.position); node.scale.fromArray(transform.scale);
    node.rotation.set(...transform.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]);
    node.updateMatrixWorld(true);
    assignThreeShadowCasterLayer(node, "dynamic");
    let restore: (() => void) | undefined;
    try {
      restore = entity.primitive || entity.character ? bindPose(node, entity) : undefined;
      return { node, restore, detachAnimation: animation?.attach(record, runtime, node, body) };
    } catch (error) { const errors = [error]; attempt([() => restore?.(), () => disposeObject(node)], errors); report(errors); throw error; }
  };
  return {
    attach(runtime: Runtime, records: Iterable<RuntimeModelRecord>) {
      if (views.has(runtime) || runtime.disposed) return;
      const entries = new Map<RuntimeModelRecord, Attachment>();
      try { for (const record of records) entries.set(record, create(record, runtime)); }
      catch (error) { const errors = [error]; entries.forEach((attachment) => cleanup(attachment, errors)); report(errors); }
      views.set(runtime, entries);
      entries.forEach(({ node }) => runtime.scene.add(node)); markSceneDirty(runtime);
    },
    detach(runtime: Runtime) {
      const entries = views.get(runtime); if (!entries) return;
      const errors: unknown[] = [];
      views.delete(runtime); entries.forEach((attachment) => { attachment.node.removeFromParent(); attempt([() => detachAnimation(attachment)], errors); });
      attempt([() => runtime.invalidateShadowCasterMaterials?.()], errors); markSceneDirty(runtime);
      return retire().catch(() => undefined).then(() => { entries.forEach((attachment) => cleanup(attachment, errors)); entries.clear(); report(errors); });
    },
    show(record: RuntimeModelRecord) {
      for (const [runtime, entries] of views) {
        if (runtime.disposed) continue;
        let attachment = entries.get(record);
        if (!attachment) { attachment = create(record, runtime); entries.set(record, attachment); }
        runtime.scene.add(attachment.node); markSceneDirty(runtime);
      }
    },
    hide(record: RuntimeModelRecord) {
      for (const [runtime, entries] of views) { entries.get(record)?.node.removeFromParent(); markSceneDirty(runtime); }
    },
    release(record: RuntimeModelRecord) {
      const errors: unknown[] = [];
      for (const [runtime, entries] of views) { const attachment = entries.get(record); if (attachment) {
        entries.delete(record); attachment.node.removeFromParent();
        attempt([() => runtime.invalidateShadowCasterMaterials?.()], errors); cleanup(attachment, errors);
      } }
      report(errors);
    },
    async dispose() {
      const old = [...views], errors: unknown[] = []; views.clear();
      old.forEach(([runtime, entries]) => {
        entries.forEach((attachment) => { attachment.node.removeFromParent(); attempt([() => detachAnimation(attachment)], errors); });
        attempt([() => runtime.invalidateShadowCasterMaterials?.()], errors);
      });
      await retire().catch(() => undefined); old.forEach(([, entries]) => entries.forEach((attachment) => cleanup(attachment, errors))); report(errors);
    },
  };
}
