import type * as THREE from "three";
import { createThreeDirectionalShadowSession } from "../rendering/adapters/three-webgpu/shadows/three-directional-shadow-session";
import type { SceneObject } from "../types";
import { subscribeRuntimeBodyLifecycle } from "./reconciliation/body-lifecycle";
import { invalidateReceiverMaterials } from "./invalidate-receiver-materials";
import type { ViewportRenderer } from "./renderer";
import type { Runtime } from "./runtime";
import {
  applyAuthoredBodyShadowCasterLayer,
  applyAuthoredShadowCasterLayers,
  classifyAuthoredShadowCasters,
  type AuthoredShadowCasterClassification,
} from "./shadow-caster-classification";
import {
  DYNAMIC_SHADOW_CASTER_TRANSFORM,
  shadowCasterTransformMask,
  STATIC_SHADOW_CASTER_TRANSFORM,
} from "./shadow-caster-transform-invalidation";

export type DirectionalShadowRuntime = Readonly<{
  bindRuntime: (runtime: Runtime) => void;
  syncAuthoredCasters: (
    objects: readonly SceneObject[],
    objectMap: ReadonlyMap<string, THREE.Group>,
  ) => void;
  refreshCasterLayers: (objectMap: ReadonlyMap<string, THREE.Group>) => void;
  invalidateTransformedSubtree: (objectId: string) => void;
  invalidateCasterMaterials: () => void;
  invalidateDynamicCasters: () => void;
  invalidateLight: () => void;
  prepareFrame: (camera: THREE.PerspectiveCamera) => void;
  afterRender: () => void;
  hasPendingRender: () => boolean;
  dispose: () => void;
}>;

/** Bridges authored scene changes and runtime body lifecycle into one CSM owner. */
export function createDirectionalShadowRuntime(
  renderer: ViewportRenderer,
  light: THREE.DirectionalLight,
): DirectionalShadowRuntime {
  let boundRuntime: Runtime | null = null;
  const session = createThreeDirectionalShadowSession({ renderer, light, onInitialized: () => {
    if (boundRuntime) invalidateReceiverMaterials(boundRuntime.scene);
  } });
  let authoredObjects: readonly SceneObject[] | null = null;
  let classification: AuthoredShadowCasterClassification | null = null;
  let authoredObjectMap: ReadonlyMap<string, THREE.Group> | null = null;
  let unsubscribeBodyLifecycle: (() => void) | null = null;
  let disposed = false;

  const invalidateClass = (casterClass: "static" | "dynamic" | undefined) => {
    if (casterClass === "static") session.invalidateStaticCasters();
    else if (casterClass === "dynamic") session.invalidateDynamicCasters();
  };

  return Object.freeze({
    bindRuntime: (runtime) => {
      boundRuntime = runtime;
      unsubscribeBodyLifecycle?.();
      unsubscribeBodyLifecycle = subscribeRuntimeBodyLifecycle(runtime, (event) => {
        if (!classification) return;
        const casterClass = classification.byObjectId.get(event.objectId);
        if (event.phase === "willChange" && event.nextBody === null) {
          invalidateClass(casterClass);
        }
        if (event.phase === "didChange" && event.nextBody) {
          applyAuthoredBodyShadowCasterLayer(classification, event.objectId, event.nextBody);
          invalidateClass(casterClass);
        }
      });
    },
    syncAuthoredCasters: (objects, objectMap) => {
      authoredObjectMap = objectMap;
      if (disposed || authoredObjects === objects) return;
      authoredObjects = objects;
      const previous = classification;
      const next = classifyAuthoredShadowCasters(objects);
      classification = next;
      applyAuthoredShadowCasterLayers(next, objectMap);
      if (!previous || previous.staticSignature !== next.staticSignature) {
        session.invalidateStaticCasters();
      }
      if (!previous || previous.dynamicSignature !== next.dynamicSignature) {
        session.invalidateDynamicCasters();
      }
    },
    refreshCasterLayers: (objectMap) => {
      if (!disposed && classification) applyAuthoredShadowCasterLayers(classification, objectMap);
    },
    invalidateTransformedSubtree: (objectId) => {
      if (disposed) return;
      const root = authoredObjectMap?.get(objectId);
      if (!root) return;
      const mask = shadowCasterTransformMask(root);
      if ((mask & STATIC_SHADOW_CASTER_TRANSFORM) !== 0) {
        session.invalidateStaticCasters();
      }
      if ((mask & DYNAMIC_SHADOW_CASTER_TRANSFORM) !== 0) {
        session.invalidateDynamicCasters();
      }
    },
    invalidateDynamicCasters: session.invalidateDynamicCasters,
    invalidateCasterMaterials: session.invalidateCasterMaterials,
    invalidateLight: session.invalidateLight,
    prepareFrame: session.prepareFrame,
    afterRender: session.afterRender,
    hasPendingRender: session.hasPendingRender,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      boundRuntime = null;
      unsubscribeBodyLifecycle?.();
      unsubscribeBodyLifecycle = null;
      authoredObjects = null;
      authoredObjectMap = null;
      classification = null;
      session.dispose();
    },
  });
}
