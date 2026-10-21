import type {
  AmbientOcclusionSettings,
  ScreenSpaceReflectionSettings,
  SkySettings,
} from "../../../types";
import type { BloomConfig } from "../../../three/gi/bloom";

export type ViewportPostEffectState = Readonly<{
  ambientOcclusion: AmbientOcclusionSettings | null;
  bloom: BloomConfig | null;
  clouds: Readonly<{ enabled: boolean; settings: SkySettings | null }>;
  godrays: Readonly<{ enabled: boolean; settings: SkySettings | null }>;
  screenSpaceReflections: ScreenSpaceReflectionSettings | null;
}>;

export type LiveAtmosphereFeatureTopology = Readonly<{
  clouds: boolean;
  godrays: boolean;
}>;

export type ActiveViewportPostEffects = Readonly<{
  ambientOcclusion: AmbientOcclusionSettings | null;
  bloom: BloomConfig | null;
  clouds: SkySettings | null;
  godrays: SkySettings | null;
  screenSpaceReflections: ScreenSpaceReflectionSettings | null;
  atmosphereTopology: LiveAtmosphereFeatureTopology;
  topologyKey: string;
}>;

export const EMPTY_VIEWPORT_POST_EFFECT_STATE: ViewportPostEffectState = Object.freeze({
  ambientOcclusion: null,
  bloom: null,
  clouds: Object.freeze({ enabled: false, settings: null }),
  godrays: Object.freeze({ enabled: false, settings: null }),
  screenSpaceReflections: null,
});

export function activeViewportPostEffects(
  state: ViewportPostEffectState,
): ActiveViewportPostEffects {
  const ambientOcclusion = activeAo(state.ambientOcclusion);
  const bloom = activeBloom(state.bloom);
  const clouds = activeClouds(state.clouds);
  const godrays = activeGodrays(state.godrays);
  const screenSpaceReflections = activeSsr(state.screenSpaceReflections);
  const atmosphereTopology = Object.freeze({
    clouds: Boolean(clouds),
    godrays: Boolean(godrays),
  }) satisfies LiveAtmosphereFeatureTopology;
  return {
    ambientOcclusion,
    bloom,
    clouds,
    godrays,
    screenSpaceReflections,
    atmosphereTopology,
    topologyKey: [
      ambientOcclusion ? "ao" : "-",
      bloom ? "bloom" : "-",
      clouds ? "clouds" : "-",
      godrays ? "godrays" : "-",
      screenSpaceReflections ? `ssr:${screenSpaceReflections.quality}` : "-",
    ].join("|"),
  };
}

export function viewportPostProcessingActive(effects: ActiveViewportPostEffects): boolean {
  return Boolean(
    effects.ambientOcclusion
    || effects.bloom
    || effects.clouds
    || effects.godrays
    || effects.screenSpaceReflections,
  );
}

function activeAo(settings: AmbientOcclusionSettings | null): AmbientOcclusionSettings | null {
  return settings?.enabled && settings.intensity > 0.001 ? settings : null;
}

function activeBloom(settings: BloomConfig | null): BloomConfig | null {
  return settings?.enabled && settings.strength > 0.001 ? settings : null;
}

function activeClouds(
  state: ViewportPostEffectState["clouds"],
): SkySettings | null {
  return state.enabled && state.settings && state.settings.cloudsCoverage > 0.001
    ? state.settings
    : null;
}

function activeGodrays(
  state: ViewportPostEffectState["godrays"],
): SkySettings | null {
  return state.enabled && state.settings && state.settings.godraysIntensity > 0.001
    ? state.settings
    : null;
}

function activeSsr(
  settings: ScreenSpaceReflectionSettings | null,
): ScreenSpaceReflectionSettings | null {
  return settings?.enabled && settings.opacity > 0.001 ? settings : null;
}
