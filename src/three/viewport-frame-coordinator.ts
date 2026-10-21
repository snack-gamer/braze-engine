import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { EngineFrame } from "../runtime/engine-loop";
import type {
  ThreeWebGpuRenderSession,
  ThreeWebGpuSessionSurface,
} from "../rendering/adapters/three-webgpu-render-session-contract";
import type { PhysicsWorldSettings, SceneObject, ScenePlaybackMode } from "../types";
import { syncClonerOutputs } from "./cloner";
import { syncAuthoredDirectionalLightFrame } from "./directional-light";
import type { ViewportRenderPipeline } from "../rendering/adapters/three-webgpu/viewport-render-pipeline";
import { renderVisibleLabels, updateLabelPositions } from "./labels";
import { applyRuntimeModifierPlan, type RuntimeModifierPlan } from "./modifiers/runtime";
import type { PhysicsViewportPlayback } from "./physics/physics-viewport-playback";
import type { ViewportRenderer } from "./renderer";
import {
  emitSceneRenderStatus,
  markSceneDirty,
  sceneNeedsSettling,
  type Runtime,
} from "./runtime";
import type { DirectionalShadowRuntime } from "./shadows";
import type { ThreeReflectionProbeSessionLane } from "../rendering/adapters/three-webgpu/reflections/three-reflection-probe-session-lane";
import type { ViewportCallbacks } from "./viewport-setup-types";
import type { ViewportDiagnostics } from "./viewport-diagnostics";
import type { ViewportHud } from "./viewport-hud";
import type { ViewportFrameRateSampler } from "./viewport-frame-rate";
import { viewportNeedsAnotherFrame } from "./viewport-performance";
import type { ViewportStatsSampler } from "./viewport-stats";
import { waterShared } from "./water/shared";
import { createParticleAdmittedFrameController } from "./particles/admitted-frame-controller";

type FrameSources = Readonly<{
  runtimeRef: MutableRefObject<Runtime | null>;
  objectsRef: MutableRefObject<SceneObject[]>;
  physicsObjectsRef?: MutableRefObject<SceneObject[]>;
  hasAnimatedClonersRef: MutableRefObject<boolean>;
  modifierPlanRef: MutableRefObject<RuntimeModifierPlan>;
  scenePlaybackModeRef: MutableRefObject<ScenePlaybackMode>;
  physicsStepTokenRef: MutableRefObject<number>;
  physicsWorldSettingsRef: MutableRefObject<PhysicsWorldSettings>;
  showStatsRef: MutableRefObject<boolean>;
  callbacksRef: MutableRefObject<ViewportCallbacks>;
}>;

type ViewportFrameCoordinatorArgs = Readonly<{
  renderSession: ThreeWebGpuRenderSession;
  renderSurface: ThreeWebGpuSessionSurface;
  renderer: ViewportRenderer;
  renderPipeline: ViewportRenderPipeline;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  directionalShadows: DirectionalShadowRuntime;
  particleBasePassBridge: Readonly<{ setEnabled: (enabled: boolean) => void }>;
  reflectionProbe: ThreeReflectionProbeSessionLane;
  key: THREE.DirectionalLight;
  objectMap: Map<string, THREE.Group>;
  labelRenderer: CSS2DRenderer;
  labelRoot: THREE.Group;
  inputs: { tickFocus: () => boolean };
  navigation: { update: (now?: number) => boolean };
  viewportMode: "scene" | "game";
  viewportHud: ViewportHud | null;
  viewportStats: ViewportStatsSampler | null;
  viewportFrameRate: ViewportFrameRateSampler;
  physicsPlayback: PhysicsViewportPlayback;
  diagnostics: ViewportDiagnostics;
  sources: FrameSources;
  rendererReady: () => boolean;
  hidden: () => boolean;
  requestFrame: () => void;
}>;

/** Coordinates one viewport render phase without owning the browser clock. */
export function createViewportFrameCoordinator({
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
  viewportMode,
  viewportHud,
  viewportStats,
  viewportFrameRate,
  physicsPlayback,
  diagnostics,
  sources,
  rendererReady,
  hidden,
  requestFrame,
}: ViewportFrameCoordinatorArgs): (frame: EngineFrame) => void {
  const lastCameraPosition = camera.position.clone();
  const lastCameraQuaternion = camera.quaternion.clone();
  const lastControlTarget = controls.target.clone();
  const particleFrames = createParticleAdmittedFrameController({
    particles: () => sources.runtimeRef.current?.particles ?? null,
    objects: () => sources.objectsRef.current,
    objectMap,
    basePassBridge: particleBasePassBridge,
  });

  const markDirtyIfCameraMoved = (runtime: Runtime | null): boolean => {
    if (!runtime) return false;
    const moved = camera.position.distanceToSquared(lastCameraPosition) > 1e-10
      || 1 - Math.abs(camera.quaternion.dot(lastCameraQuaternion)) > 1e-10
      || controls.target.distanceToSquared(lastControlTarget) > 1e-10;
    if (!moved) return false;
    lastCameraPosition.copy(camera.position);
    lastCameraQuaternion.copy(camera.quaternion);
    lastControlTarget.copy(controls.target);
    markSceneDirty(runtime);
    return true;
  };
  const renderScene = () => {
    const previousAutoClear = renderer.autoClear;
    const drawCallsBefore = renderer.info.render.drawCalls;
    const trianglesBefore = renderer.info.render.triangles;
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(null);
      const runtime = sources.runtimeRef.current;
      particleFrames.prepareRender();
      directionalShadows.prepareFrame(camera);
      renderPipeline.render();
      directionalShadows.afterRender();
      diagnostics.markRenderSubmitted();
      const submittedAt = performance.now();
      const frameRate = viewportFrameRate.sample(submittedAt);
      if (frameRate) sources.callbacksRef.current.onViewportFrameRate?.(frameRate);
      if (runtime) {
        runtime.renderFrame += 1;
        runtime.framesSinceSceneChange += 1;
      }
      viewportHud?.setVisible(sources.showStatsRef.current);
      const stats = sources.showStatsRef.current
        ? viewportStats?.sample(submittedAt, {
            drawCalls: Math.max(0, renderer.info.render.drawCalls - drawCallsBefore),
            triangles: Math.max(0, renderer.info.render.triangles - trianglesBefore),
          }) ?? null
        : null;
      if (stats) viewportHud?.update(stats, renderSession.diagnostics());
    } finally {
      renderer.autoClear = previousAutoClear;
    }
  };

  return ({ index: frameIndex, nowMilliseconds: now, elapsedSeconds: elapsed, deltaSeconds }) => {
    if (hidden() || !rendererReady()) return;
    const focusChanged = inputs.tickFocus();
    controls.update();
    const navigationChanged = navigation.update(now);
    const runtime = sources.runtimeRef.current;
    if (runtime) runtime.scenePlaybackMode = sources.scenePlaybackModeRef.current;
    if (navigationChanged && runtime) markSceneDirty(runtime);
    const cameraMoved = markDirtyIfCameraMoved(runtime);
    const sceneWasDirty = Boolean(runtime && runtime.framesSinceSceneChange === 0);
    const directionalLightChanged = runtime ? syncAuthoredDirectionalLightFrame(runtime) : false;
    runtime?.sky?.update();
    waterShared.sunDirection.subVectors(key.position, key.target.position).normalize();
    waterShared.sunIntensity = key.intensity;
    const animationPreviewMode = Boolean(runtime?.animationPreviewMode);
    const physicsChanged = runtime
      ? physicsPlayback.present({
          runtime,
          mode: sources.scenePlaybackModeRef.current,
          frameDeltaSeconds: deltaSeconds,
        })
      : false;
    if (runtime && !runtime.clonersDirty && sources.hasAnimatedClonersRef.current) runtime.clonersDirty = true;
    const clonersChanged = runtime && runtime.clonersDirty
      ? syncClonerOutputs(runtime, sources.objectsRef.current, true)
      : false;
    const modifiersChanged = runtime && !animationPreviewMode
      ? applyRuntimeModifierPlan(runtime, elapsed, sources.modifierPlanRef.current)
      : false;
    const particlesActive = particleFrames.observeFrame(
      deltaSeconds,
      Boolean(runtime && sources.scenePlaybackModeRef.current !== "paused"),
    );
    directionalShadows.syncAuthoredCasters(sources.objectsRef.current, objectMap);
    if (clonersChanged) directionalShadows.refreshCasterLayers(objectMap);
    if (directionalLightChanged) directionalShadows.invalidateLight();
    if (
      physicsChanged
      || clonersChanged
      || modifiersChanged
      || (sceneWasDirty && !cameraMoved && !directionalLightChanged)
    ) directionalShadows.invalidateDynamicCasters();
    renderPipeline.setShadowsActive(key.castShadow);
    const opportunity = renderSession.opportunityForFrame(frameIndex, now);
    reflectionProbe.flush(opportunity);
    const renderDisposition = renderSurface.request(opportunity, renderScene);
    if (!runtime) return;
    runtime.onRenderStatusChange = sources.callbacksRef.current.onRenderStatusChange;
    if (!animationPreviewMode && (runtime.labelsDirty || modifiersChanged || clonersChanged)) {
      updateLabelPositions(runtime);
      runtime.labelsDirty = false;
    }
    if (!animationPreviewMode && viewportMode === "scene") {
      renderVisibleLabels(labelRenderer, labelRoot, camera);
      emitSceneRenderStatus(runtime);
    }
    physicsPlayback.schedule({
      runtime,
      objects: (sources.physicsObjectsRef ?? sources.objectsRef).current,
      worldSettings: sources.physicsWorldSettingsRef.current,
      mode: sources.scenePlaybackModeRef.current,
      stepToken: sources.physicsStepTokenRef.current,
      frameDeltaSeconds: deltaSeconds,
      opportunity,
    });
    const physics = physicsPlayback.diagnostics();
    diagnostics.publishPhysics(now, physics);
    const activeModifiers = !animationPreviewMode
      && (sources.modifierPlanRef.current.presence.buoyancy
        || sources.modifierPlanRef.current.presence.motionPulse);
    const keepRendering = viewportNeedsAnotherFrame({
      animatedCloners: sources.hasAnimatedClonersRef.current,
      activeModifiers,
      activeParticles: particlesActive,
      frameSkipped: renderDisposition !== "submitted",
      physicsPending: physics.simulationPending || physics.queuedSteps > 0,
      deviceTaskPending: reflectionProbe.hasPendingAdmission() || physicsPlayback.hasPendingDeviceWork(),
      playbackMode: sources.scenePlaybackModeRef.current,
      sceneSettling: sceneNeedsSettling(runtime),
      shadowUpdatePending: directionalShadows.hasPendingRender(),
      transientCameraMotion: focusChanged || navigationChanged,
    });
    diagnostics.setRenderLoopActive(keepRendering);
    if (keepRendering) requestFrame();
  };
}
