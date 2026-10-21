import * as THREE from "three";
import { createCameraEmitter } from "./controls/camera-emitter";
import { installInputs } from "./controls/input";
import { createPhysicsViewportPlayback } from "./physics/shared-physics-world";
import { emitSceneRenderStatus, markSceneDirty } from "./runtime";
import { createViewportDisposer } from "./viewport-disposal";
import { createViewportFrameCoordinator } from "./viewport-frame-coordinator";
import {
  createViewportFrameScheduler,
  type ViewportFrameScheduler,
} from "./viewport-frame-scheduler";
import { createViewportNavigationGizmo } from "./viewport-navigation-gizmo";
import { createViewportResizeController } from "./viewport-resize";
import type { ViewportSetupArgs } from "./viewport-setup-types";
import { createViewportStatsSampler } from "./viewport-stats";
import { createViewportFrameRateSampler } from "./viewport-frame-rate";
import { viewportIsSuspended } from "./viewport-performance";
import {
  createViewportConstructionLifetime,
  type ViewportConstructionLifetime,
} from "./viewport-construction-lifetime";
import { createViewportSceneFoundation } from "./viewport-scene-foundation";
import { createViewportRuntime } from "./viewport-runtime-factory";
import { createViewportReflectionProbe } from "./viewport-reflection-probe";

/** Builds one viewport and wires its feature-owned lifetime controllers. */
export function setupViewport(args: ViewportSetupArgs): () => void {
  const construction = createViewportConstructionLifetime();
  try {
    return assembleViewport(args, construction);
  } catch (error) {
    construction.dispose();
    throw error;
  }
}

function assembleViewport(
  args: ViewportSetupArgs,
  construction: ViewportConstructionLifetime,
): () => void {
  const {
    host,
    renderSession,
    renderSurfaceName,
    viewportHudHost,
    initial,
    runtimeRef,
    objectsRef,
    hasAnimatedClonersRef,
    modifierPlanRef,
    scenePlaybackModeRef,
    physicsStepTokenRef,
    physicsWorldSettingsRef,
    showStatsRef,
    renderSizeRef,
    lowResolutionRef,
    cameraPreviewAspectRef,
    callbacksRef,
    activeObjectIdRef,
    lastEmittedCameraRef,
    onRendererReady,
  } = args;
  let scheduler!: ViewportFrameScheduler;
  const foundation = createViewportSceneFoundation({
    host,
    initial,
    renderSession,
    renderSurfaceName,
    showStats: showStatsRef.current,
    onParticleGpuCommitReady: () => scheduler?.requestFrame(),
    ...(viewportHudHost ? { viewportHudHost } : {}),
  });
  construction.defer(foundation.dispose);
  const {
    assetCache, camera, cameraGizmoMap, cameraGizmoRoot, canvas, controls, diagnostics,
    directionalShadows, grid, hemi, key, labelMap, labelRenderer, labelRoot,
    objectMap, objectRoot, particles, pointer, raycaster, renderer,
    rendererBackend, renderPipeline, renderSurface, scene, transformControls, viewportHud,
    particleBasePassBridge,
  } = foundation;
  const reflectionProbe = createViewportReflectionProbe(
    renderSession,
    renderSurfaceName,
    runtimeRef,
  );
  construction.defer(reflectionProbe.dispose);
  let viewportResize!: ReturnType<typeof createViewportResizeController>;
  const viewportStats = viewportHud
    ? createViewportStatsSampler(renderer, objectRoot, rendererBackend, {
        canvas,
        pixelRatio: () => viewportResize.getPixelRatio(),
      })
    : null;
  const viewportFrameRate = createViewportFrameRateSampler();

  viewportResize = createViewportResizeController({
    camera,
    cameraPreviewAspect: cameraPreviewAspectRef,
    cameraGizmos: () => cameraGizmoMap.values(),
    host,
    labelRenderer,
    lowResolution: lowResolutionRef,
    onResize: () => {
      const runtime = runtimeRef.current;
      if (runtime?.renderer === renderer) markSceneDirty(runtime);
    },
    renderSize: renderSizeRef,
    outputSurface: renderSurface,
  });
  construction.defer(viewportResize.dispose);
  const emitter = createCameraEmitter({
    camera,
    controls,
    lastEmittedRef: lastEmittedCameraRef,
    onChange: () => callbacksRef.current.onCameraChange,
  });
  construction.defer(emitter.dispose);
  const inputs = initial.viewportMode === "scene"
    ? installInputs({
        canvas,
        camera,
        controls,
        transformControls,
        objectRoot,
        pointer,
        raycaster,
        emitter,
        runtimeRef,
        objectsRef,
        callbacksRef,
        activeObjectIdRef,
      })
    : {
        dispose: () => undefined,
        tickFocus: () => false,
        focusSelection: () => undefined,
        cancelFocus: () => undefined,
      };
  construction.defer(inputs.dispose);
  const navigation = initial.viewportMode === "scene"
    ? createViewportNavigationGizmo({
        host,
        camera,
        controls,
        emitter,
        cancelFocus: inputs.cancelFocus,
        requestFrame: () => runtimeRef.current?.requestFrame?.(),
      })
    : { update: () => false, destroy: () => undefined };
  construction.defer(navigation.destroy);
  const resizeObserver = new ResizeObserver(viewportResize.schedule);
  construction.defer(() => resizeObserver.disconnect());
  resizeObserver.observe(host);
  viewportResize.flush();
  emitter.emit();

  const physicsPlayback = createPhysicsViewportPlayback(renderSession);
  construction.defer(physicsPlayback.dispose);
  const keyShadowOffset = new THREE.Vector3().subVectors(key.position, key.target.position);
  const runViewportFrame = createViewportFrameCoordinator({
    renderSession,
    renderSurface,
    renderer,
    renderPipeline,
    camera,
    controls,
    directionalShadows,
    particleBasePassBridge,
    reflectionProbe,
    key,
    objectMap,
    labelRenderer,
    labelRoot,
    inputs,
    navigation,
    viewportMode: initial.viewportMode,
    viewportHud,
    viewportStats,
    viewportFrameRate,
    physicsPlayback,
    diagnostics,
    sources: {
      runtimeRef,
      objectsRef,
      physicsObjectsRef: args.physicsObjectsRef,
      hasAnimatedClonersRef,
      modifierPlanRef,
      scenePlaybackModeRef,
      physicsStepTokenRef,
      physicsWorldSettingsRef,
      showStatsRef,
      callbacksRef,
    },
    rendererReady: () => renderSession.getStatus() === "ready",
    hidden: () => viewportIsSuspended(document.hidden, host.getClientRects().length),
    requestFrame: () => scheduler.requestFrame(),
  });
  scheduler = createViewportFrameScheduler({
    diagnostics,
    onFrame: runViewportFrame,
    onVisible: () => runtimeRef.current?.requestFrame?.(),
  });
  construction.defer(scheduler.dispose);
  runtimeRef.current = createViewportRuntime({
    renderer,
    rendererBackend,
    labelRenderer,
    scene,
    camera,
    controls,
    focusSelection: inputs.focusSelection,
    transformControls,
    objectRoot,
    labelRoot,
    objectMap,
    labelMap,
    assetCache,
    grid,
    raycaster,
    pointer,
    requestFrame: scheduler.requestFrame,
    resizeViewport: viewportResize.flush,
    particles,
    renderPipeline,
    reflectionProbe,
    invalidateShadowCasterTransform: directionalShadows.invalidateTransformedSubtree,
    invalidateShadowCasterMaterials: directionalShadows.invalidateCasterMaterials,
    characterMotorFor: physicsPlayback.characterMotorFor,
    cameraGizmoRoot,
    cameraGizmoMap,
    scenePlaybackMode: scenePlaybackModeRef.current,
    animationPreviewMode: initial.animationPreviewMode,
    environmentReady: !initial.environment.hdriUrl,
    onRenderStatusChange: callbacksRef.current.onRenderStatusChange,
    worldLights: { hemisphere: hemi, key, keyOffset: keyShadowOffset },
  });
  construction.defer(() => {
    const runtime = runtimeRef.current;
    if (runtime?.renderer !== renderer) return;
    runtime.disposed = true;
    runtime.sky?.dispose();
    runtimeRef.current = null;
  });
  const dispose = createViewportDisposer({
    runtimeRef,
    foundation,
    physicsPlayback,
    scheduler,
    viewportResize,
    emitter,
    navigation,
    resizeObserver,
    inputs,
    reflectionProbe,
  });
  construction.release();
  try {
    directionalShadows.bindRuntime(runtimeRef.current);
    markSceneDirty(runtimeRef.current);
    emitSceneRenderStatus(runtimeRef.current);
    const hasPhysics = objectsRef.current.some((object) => (
      object.rigidbody?.enabled === true
      || object.colliders?.some((collider) => collider.enabled) === true
    ));
    if (hasPhysics) physicsPlayback.prepare(runtimeRef.current);
    onRendererReady?.();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
