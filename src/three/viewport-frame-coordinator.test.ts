import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PHYSICS_WORLD_SETTINGS } from "../physics/domain/world-settings";
import type { EngineFrame } from "../runtime/engine-loop";
import { createRuntimeModifierPlan } from "./modifiers/runtime";
import type { Runtime } from "./runtime";
import { createViewportFrameCoordinator } from "./viewport-frame-coordinator";

const physicsDiagnostics = {
  status: "idle" as const,
  bodyCount: 0,
  maxPairs: 0,
  maxManifolds: 0,
  completedStepId: 0,
  appliedStepId: 0,
  readbackLag: 0,
  droppedSeconds: 0,
  simulationPending: false,
  queuedSteps: 0,
  estimatedStepMilliseconds: 0,
  inFlightBatches: 0,
  instancedBodies: 0,
};

function frame(index: number, nowMilliseconds: number): EngineFrame {
  return {
    index,
    nowMilliseconds,
    deltaSeconds: 0.016,
    unscaledDeltaSeconds: 0.016,
    timeScale: 1,
    elapsedSeconds: nowMilliseconds / 1_000,
    unscaledElapsedSeconds: nowMilliseconds / 1_000,
  };
}

describe("viewport frame admission coordination", () => {
  it("keeps particle GPU sync, simulation, draw state, and shadows inside a submitted render", () => {
    const camera = new THREE.PerspectiveCamera();
    const key = new THREE.DirectionalLight();
    key.castShadow = true;
    const renderOrder: string[] = [];
    const particleSyncGpu = vi.fn(() => { renderOrder.push("particle-sync-gpu"); });
    const particleTick = vi.fn(() => { renderOrder.push("particle-tick"); });
    const runtime = {
      disposed: false,
      scenePlaybackMode: "edit",
      animationPreviewMode: true,
      framesSinceSceneChange: 0,
      renderFrame: 0,
      authoredDirectionalLightActive: false,
      worldLights: { key, keyOffset: new THREE.Vector3(4, 7, 5) },
      objectMap: new Map(),
      sky: null,
      clonersDirty: false,
      labelsDirty: false,
      particles: {
        isActive: () => true,
        syncGpuForAdmittedRender: particleSyncGpu,
        tickGpuForAdmittedRender: particleTick,
      },
    } as unknown as Runtime;
    const requestFrame = vi.fn();
    const setParticlePassEnabled = vi.fn();
    const directionalShadows = {
      invalidateCasterMaterials: vi.fn(),
      bindRuntime: vi.fn(),
      syncAuthoredCasters: vi.fn(),
      refreshCasterLayers: vi.fn(),
      invalidateTransformedSubtree: vi.fn(),
      invalidateDynamicCasters: vi.fn(),
      invalidateLight: vi.fn(),
      prepareFrame: vi.fn(),
      afterRender: vi.fn(() => { renderOrder.push("shadow-after-render"); }),
      hasPendingRender: () => true,
      dispose: vi.fn(),
    };
    const rendererInfo = { drawCalls: 9, triangles: 100 };
    const renderer = {
      autoClear: true,
      info: { render: rendererInfo },
      setRenderTarget: vi.fn(),
    } as never;
    let requestCount = 0;
    const sampleStats = vi.fn(() => null);
    const coordinator = createViewportFrameCoordinator({
      renderSession: {
        opportunityForFrame: () => "raf:test:1",
      } as never,
      renderSurface: {
        request: (_opportunity: unknown, submission: (renderer: unknown) => void) => {
          requestCount += 1;
          if (requestCount === 1) return "queued";
          submission(renderer);
          return "submitted";
        },
      } as never,
      renderer,
      renderPipeline: {
        render: () => {
          renderOrder.push("render");
          rendererInfo.drawCalls += 2;
          rendererInfo.triangles += 6;
        },
        setShadowsActive: vi.fn(),
      } as never,
      camera,
      controls: { target: new THREE.Vector3(), update: vi.fn() } as never,
      directionalShadows,
      particleBasePassBridge: { setEnabled: setParticlePassEnabled },
      reflectionProbe: {
        flush: vi.fn(() => "idle"),
        hasPendingAdmission: () => false,
      } as never,
      key,
      objectMap: runtime.objectMap,
      labelRenderer: {} as never,
      labelRoot: new THREE.Group(),
      inputs: { tickFocus: () => false },
      navigation: { update: () => false },
      viewportMode: "game",
      viewportHud: null,
      viewportStats: { sample: sampleStats },
      viewportFrameRate: { sample: () => null } as never,
      physicsPlayback: {
        present: () => false,
        schedule: () => false,
        hasPendingDeviceWork: () => false,
        diagnostics: () => physicsDiagnostics,
      } as never,
      diagnostics: {
        markRenderSubmitted: vi.fn(),
        publishPhysics: vi.fn(),
        setRenderLoopActive: vi.fn(),
      } as never,
      sources: {
        runtimeRef: { current: runtime },
        objectsRef: { current: [] },
        hasAnimatedClonersRef: { current: false },
        modifierPlanRef: { current: createRuntimeModifierPlan([]) },
        scenePlaybackModeRef: { current: "edit" },
        physicsStepTokenRef: { current: 0 },
        physicsWorldSettingsRef: { current: DEFAULT_PHYSICS_WORLD_SETTINGS },
        showStatsRef: { current: true },
        callbacksRef: { current: {} },
      } as never,
      rendererReady: () => true,
      hidden: () => false,
      requestFrame,
    });

    coordinator(frame(1, 0));
    expect(particleSyncGpu).not.toHaveBeenCalled();
    expect(particleTick).not.toHaveBeenCalled();
    expect(setParticlePassEnabled).not.toHaveBeenCalled();
    runtime.framesSinceSceneChange = 0;
    coordinator(frame(2, 16));

    expect(directionalShadows.invalidateDynamicCasters).toHaveBeenCalledTimes(2);
    // Shadow planning/update belongs to the one callback accepted for rendering,
    // not the rejected opportunity that preceded it.
    expect(directionalShadows.prepareFrame).toHaveBeenCalledOnce();
    expect(renderOrder).toEqual([
      "particle-sync-gpu",
      "particle-tick",
      "render",
      "shadow-after-render",
    ]);
    expect(particleSyncGpu).toHaveBeenCalledOnce();
    expect(particleTick).toHaveBeenCalledOnce();
    expect(particleTick).toHaveBeenCalledWith(0.032);
    expect(setParticlePassEnabled).toHaveBeenCalledOnce();
    expect(setParticlePassEnabled).toHaveBeenCalledWith(true);
    expect(runtime.renderFrame).toBe(1);
    expect(sampleStats).toHaveBeenCalledWith(expect.any(Number), {
      drawCalls: 2,
      triangles: 6,
    });
    expect(requestFrame).toHaveBeenCalled();
  });
});
