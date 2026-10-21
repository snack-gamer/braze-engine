import { describe, expect, it } from "vitest";
import { defaultEnvironment } from "../../../constants";
import {
  EMPTY_VIEWPORT_POST_EFFECT_STATE,
  activeViewportPostEffects,
  viewportPostProcessingActive,
} from "./viewport-post-effect-state";

describe("viewport post-effect topology", () => {
  it("uses the direct path when no effect consumes an offscreen attachment", () => {
    const effects = activeViewportPostEffects(EMPTY_VIEWPORT_POST_EFFECT_STATE);
    expect(effects.topologyKey).toBe("-|-|-|-|-");
    expect(viewportPostProcessingActive(effects)).toBe(false);
    expect(effects.atmosphereTopology).toEqual({
      clouds: false,
      godrays: false,
    });
  });

  it("excludes enabled effects whose contribution is zero", () => {
    const effects = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      ambientOcclusion: { ...defaultEnvironment.ao, enabled: true, intensity: 0 },
      bloom: { enabled: true, strength: 0, threshold: 0.8, smoothWidth: 0.1, radius: 0.4 },
      clouds: { enabled: true, settings: { ...defaultEnvironment.sky, cloudsCoverage: 0 } },
      godrays: { enabled: true, settings: { ...defaultEnvironment.sky, godraysIntensity: 0 } },
      screenSpaceReflections: { ...defaultEnvironment.ssr, enabled: true, opacity: 0 },
    });
    expect(viewportPostProcessingActive(effects)).toBe(false);
  });

  it("changes atmosphere topology only when a contribution becomes active", () => {
    const first = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      clouds: { enabled: true, settings: { ...defaultEnvironment.sky, cloudsCoverage: 0.3 } },
      godrays: { enabled: true, settings: { ...defaultEnvironment.sky, godraysIntensity: 0.4 } },
    });
    const uniformChange = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      clouds: { enabled: true, settings: { ...defaultEnvironment.sky, cloudsCoverage: 0.8 } },
      godrays: { enabled: true, settings: { ...defaultEnvironment.sky, godraysIntensity: 1.2 } },
    });
    const cloudsDisabled = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      clouds: { enabled: true, settings: { ...defaultEnvironment.sky, cloudsCoverage: 0 } },
      godrays: { enabled: true, settings: { ...defaultEnvironment.sky, godraysIntensity: 1.2 } },
    });

    expect(uniformChange.topologyKey).toBe(first.topologyKey);
    expect(uniformChange.atmosphereTopology).toEqual({
      clouds: true,
      godrays: true,
    });
    expect(cloudsDisabled.topologyKey).not.toBe(first.topologyKey);
  });

  it("bakes only topology-changing SSR quality into the graph key", () => {
    const first = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      screenSpaceReflections: { ...defaultEnvironment.ssr, enabled: true, opacity: 0.5, quality: 0.4 },
    });
    const liveUniformChange = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      screenSpaceReflections: {
        ...defaultEnvironment.ssr,
        enabled: true,
        opacity: 0.8,
        quality: 0.4,
      },
    });
    const bakedChange = activeViewportPostEffects({
      ...EMPTY_VIEWPORT_POST_EFFECT_STATE,
      screenSpaceReflections: {
        ...defaultEnvironment.ssr,
        enabled: true,
        opacity: 0.8,
        quality: 0.8,
      },
    });
    expect(liveUniformChange.topologyKey).toBe(first.topologyKey);
    expect(bakedChange.topologyKey).not.toBe(first.topologyKey);
  });
});
