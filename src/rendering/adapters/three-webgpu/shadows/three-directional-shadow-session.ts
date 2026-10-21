import * as THREE from "three";
import {
  createThreeDirectionalCsmController,
  type OwnedThreeCsmSurface,
  type ThreeDirectionalShadowRenderer,
} from "./three-directional-csm-controller";
import { createThreeShadowFrameTracker } from "./three-shadow-frame-tracker";
import {
  createThreeShadowPlanAdapter,
  type ThreeShadowFramePlan,
} from "./three-shadow-plan-adapter";

export type ThreeDirectionalShadowSession = Readonly<{
  invalidateCasterMaterials: () => void;
  invalidateDynamicCasters: () => void;
  invalidateExtent: () => void;
  invalidateLight: () => void;
  invalidateStaticCasters: () => void;
  prepareFrame: (camera: THREE.PerspectiveCamera) => void;
  afterRender: () => void;
  hasPendingRender: () => boolean;
  dispose: () => void;
}>;

type ThreeDirectionalShadowSessionArgs = Readonly<{
  renderer: ThreeDirectionalShadowRenderer;
  light: THREE.DirectionalLight;
  createCsm?: (light: THREE.DirectionalLight) => OwnedThreeCsmSurface;
  onInitialized?: () => void;
}>;

/** Owns one public Three r184 CSM node and its generation-driven update state. */
export function createThreeDirectionalShadowSession({
  renderer,
  light,
  createCsm,
  onInitialized,
}: ThreeDirectionalShadowSessionArgs): ThreeDirectionalShadowSession {
  const adapter = createThreeShadowPlanAdapter();
  const csm = createThreeDirectionalCsmController({
    renderer,
    light,
    ...(createCsm ? { createCsm } : {}),
  });
  const frameTracker = createThreeShadowFrameTracker();
  let latestFrame: ThreeShadowFramePlan | null = null;
  let awaitingInitialization = true;
  let initializationProbePending = true;
  let updatesAwaitingRender = false;
  let disabledRendered = false;
  let disposed = false;

  const invalidate = (key: Parameters<typeof frameTracker.invalidate>[0]) => {
    frameTracker.invalidate(key);
    if (awaitingInitialization) initializationProbePending = true;
  };

  return Object.freeze({
    invalidateCasterMaterials: () => {
      if (disposed) return;
      csm.invalidateCasterMaterials();
      invalidate("staticCasters");
      invalidate("dynamicCasters");
    },
    invalidateDynamicCasters: () => invalidate("dynamicCasters"),
    invalidateExtent: () => invalidate("extent"),
    invalidateLight: () => invalidate("light"),
    invalidateStaticCasters: () => invalidate("staticCasters"),
    prepareFrame: (camera) => {
      if (disposed) return;
      frameTracker.observe(camera);
      if (!light.castShadow) {
        initializationProbePending = false;
        updatesAwaitingRender = false;
        return;
      }
      if (disabledRendered) {
        csm.recreate();
        adapter.reset();
        awaitingInitialization = true;
        initializationProbePending = true;
        disabledRendered = false;
        frameTracker.forceChanged();
      }
      if (!frameTracker.hasChanges() && !awaitingInitialization && latestFrame !== null) return;
      if (frameTracker.hasChanges() || latestFrame === null) {
        latestFrame = adapter.plan(frameTracker.currentInput());
        frameTracker.markPlanned();
      }
      const result = csm.applyFrame(latestFrame);
      if (result.status === "awaiting-three-initialization") {
        light.shadow.needsUpdate = true;
        initializationProbePending = true;
        return;
      }
      const initialized = awaitingInitialization;
      awaitingInitialization = false;
      initializationProbePending = false;
      const movedCascades = csm.updateSnappedCascadeCameras();
      updatesAwaitingRender ||= result.requestedUpdates > 0 || movedCascades > 0;
      if (initialized) onInitialized?.();
    },
    afterRender: () => {
      if (disposed) return;
      if (!light.castShadow) {
        disabledRendered = true;
        initializationProbePending = false;
        updatesAwaitingRender = false;
        return;
      }
      if (!awaitingInitialization) {
        updatesAwaitingRender = false;
        return;
      }
      if (!latestFrame) {
        initializationProbePending = false;
        return;
      }
      const probe = csm.applyFrame(latestFrame);
      if (probe.status === "awaiting-three-initialization") {
        // An empty scene has no receiving material to initialize CSM. Keep the
        // plan, but do not spin RAF; the next real scene invalidation retries it.
        initializationProbePending = false;
        return;
      }
      adapter.reset();
      latestFrame = adapter.plan(frameTracker.currentInput());
      const initial = csm.applyFrame(latestFrame);
      const movedCascades = initial.status === "applied"
        ? csm.updateSnappedCascadeCameras()
        : 0;
      awaitingInitialization = initial.status !== "applied";
      initializationProbePending = awaitingInitialization;
      updatesAwaitingRender = initial.status === "applied"
        && (initial.requestedUpdates > 0 || movedCascades > 0);
      if (!awaitingInitialization) onInitialized?.();
    },
    hasPendingRender: () => (
      !disposed
      && light.castShadow
      && (initializationProbePending || updatesAwaitingRender)
    ),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      csm.dispose();
      adapter.reset();
      latestFrame = null;
      initializationProbePending = false;
      updatesAwaitingRender = false;
    },
  });
}
