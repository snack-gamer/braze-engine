import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";
import { normalizeAmbientOcclusionSettings } from "../../lib/ao-settings";
import { acquireEnvTexture } from "../../lib/env-texture";
import { normalizeSkySettings } from "../../lib/sky-settings";
import { normalizeScreenSpaceReflectionSettings } from "../../lib/ssr-settings";
import type { EnvironmentSettings } from "../../types";
import { emitSceneRenderStatus, markSceneDirty, type Runtime } from "../runtime";
import { WebGpuSkyRuntime } from "../sky/runtime";
import { waterShared } from "../water/shared";

type Args = {
  runtimeRef: MutableRefObject<Runtime | null>;
  environment: EnvironmentSettings;
};

const THREE_TONE_MAPPING: Record<EnvironmentSettings["toneMapping"], THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  filmic: THREE.AgXToneMapping,
  linear: THREE.LinearToneMapping,
  neutral: THREE.NeutralToneMapping,
  reinhard: THREE.ReinhardToneMapping,
};

function updateViewport(
  runtimeRef: MutableRefObject<Runtime | null>,
  update: (runtime: Runtime) => void,
): void {
  const runtime = runtimeRef.current;
  if (!runtime || runtime.disposed) return;
  update(runtime);
  markSceneDirty(runtime);
}

// Environment / IBL / tone mapping / GI settings. Split into focused effects
// so a single-knob change only triggers its own setter — dragging AO
// intensity won't re-fire SSR or refresh the reflection probe,
// which used to happen via a single mega-effect with every field as a dep.
// HDRI textures use viewport leases, so both views share one load without
// allowing either viewport to dispose the other's live environment.
export function useEnvironment({ runtimeRef, environment }: Args) {
  // Renderer-level image response — cheap setters, no shader rebuild.
  useEffect(() => {
    updateViewport(runtimeRef, (runtime) => {
      runtime.renderPipeline.setImageResponse(
        THREE_TONE_MAPPING[environment.toneMapping],
        2 ** environment.exposureEv,
      );
    });
  }, [runtimeRef, environment.toneMapping, environment.exposureEv]);

  // Environment intensity / rotation — affects IBL contribution at material
  // shading time.
  useEffect(() => {
    updateViewport(runtimeRef, (runtime) => {
      const rot = THREE.MathUtils.degToRad(environment.rotationDeg);
      runtime.scene.environmentRotation.set(0, rot, 0);
      runtime.scene.backgroundRotation.set(0, rot, 0);
      runtime.scene.environmentIntensity = environment.intensity;
      runtime.scene.backgroundIntensity = Math.max(0.75, environment.intensity);
      waterShared.environmentIntensity = environment.intensity;
      waterShared.environmentRotation = rot;
      waterShared.environmentColor.set("#000000");
    });
  }, [runtimeRef, environment.intensity, environment.rotationDeg]);

  // Per-effect setters — each call writes uniforms and only rebuilds the
  // render topology when its `active` flag toggles. Splitting means
  // moving an AO slider doesn't re-apply SSR or other effects.
  useEffect(() => {
    updateViewport(runtimeRef, (runtime) => {
      runtime.renderPipeline.setAmbientOcclusion(normalizeAmbientOcclusionSettings(environment.ao));
    });
  }, [runtimeRef, environment.ao]);

  useEffect(() => {
    updateViewport(runtimeRef, (runtime) => {
      runtime.renderPipeline.setScreenSpaceReflection(normalizeScreenSpaceReflectionSettings(environment.ssr));
    });
  }, [runtimeRef, environment.ssr]);

  useEffect(() => {
    updateViewport(runtimeRef, (runtime) => {
      runtime.renderPipeline.setBloom({
        enabled: environment.bloom,
        strength: environment.bloomIntensity,
        threshold: environment.bloomThreshold,
        smoothWidth: environment.bloomSmoothing,
        radius: environment.bloomRadius,
      });
    });
  }, [
    runtimeRef,
    environment.bloom,
    environment.bloomIntensity,
    environment.bloomThreshold,
    environment.bloomSmoothing,
    environment.bloomRadius,
  ]);

  // Sky runtime + low-resolution sky effects — uniform writes, runs on any sky slider tick.
  // Cheap. Reflection-probe refresh lives in a separate effect with narrower
  // deps so it does NOT fire here.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (environment.worldSource === "sky") {
      const skySettings = normalizeSkySettings(environment.sky);
      if (!runtime.sky) runtime.sky = new WebGpuSkyRuntime(runtime);
      runtime.sky.applySettings(skySettings);
      runtime.renderPipeline.setSkyEffects(skySettings, true);
    } else {
      if (runtime.sky) {
        runtime.sky.dispose();
        runtime.sky = null;
      }
      runtime.renderPipeline.setSkyEffects(normalizeSkySettings(environment.sky), false);
    }
    markSceneDirty(runtime);
  }, [runtimeRef, environment.worldSource, environment.sky]);

  // Coalesce sky scrubbing into one settled probe invalidation. The timer does
  // no rendering: it only marks the governed reflection lane dirty and wakes
  // the shared EngineLoop for the eventual six-face capture.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (environment.worldSource !== "sky") return;
    const timer = window.setTimeout(() => {
      if (runtime.disposed || runtimeRef.current !== runtime) return;
      runtime.reflectionProbe.invalidate({
        scene: runtime.scene,
        position: runtime.camera.position,
      });
      markSceneDirty(runtime);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [runtimeRef, environment.worldSource, environment.sky]);

  // HDRI loading + scene.environment assignment for HDRI mode.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (environment.worldSource !== "hdri") return;
    const { scene } = runtime;

    const setEnvironmentReady = (ready: boolean) => {
      if (runtime.environmentReady === ready) return;
      runtime.environmentReady = ready;
      markSceneDirty(runtime);
      emitSceneRenderStatus(runtime);
    };

    const applyTexture = (
      texture: THREE.Texture | null,
      options: { hdriReady?: boolean } = {},
    ) => {
      const hdriReady = Boolean(options.hdriReady);
      setEnvironmentReady(!environment.hdriUrl || hdriReady);
      if (texture) {
        runtime.worldLights.hemisphere.intensity = 0;
        if (!runtime.authoredDirectionalLightActive) {
          runtime.worldLights.key.intensity = 0;
          runtime.worldLights.key.castShadow = false;
          waterShared.sunIntensity = 0;
        }
        scene.environment = texture;
        scene.background = texture;
      } else {
        // An empty HDRI selection is a valid neutral authoring state. It is
        // considered ready above and must not be reported as a runtime fault.
        scene.environment = null;
        scene.background = null;
      }
      markSceneDirty(runtime);
    };

    if (!environment.hdriUrl) {
      applyTexture(null);
      return;
    }

    applyTexture(null, { hdriReady: false });

    const lease = acquireEnvTexture(environment.hdriUrl);
    let cancelled = false;
    let appliedTexture: THREE.Texture | null = null;
    lease.value
      .then((texture) => {
        if (cancelled) return;
        appliedTexture = texture;
        applyTexture(texture, { hdriReady: true });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(`[environment] HDRI load failed: ${environment.hdriUrl}`, error);
        applyTexture(null, { hdriReady: false });
      });

    return () => {
      cancelled = true;
      if (appliedTexture && scene.environment === appliedTexture) scene.environment = null;
      if (appliedTexture && scene.background === appliedTexture) scene.background = null;
      lease.release();
    };
  }, [runtimeRef, environment.worldSource, environment.hdriUrl]);

  // Sky-mode environment readiness — cheap status emit when entering sky.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (environment.worldSource !== "sky") return;
    runtime.environmentReady = true;
    emitSceneRenderStatus(runtime);
  }, [runtimeRef, environment.worldSource]);
}
