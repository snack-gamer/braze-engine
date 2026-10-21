import type { ParticleEffectSettings } from "./domain/particle-effect";

export const defaultParticleEffectSettings: ParticleEffectSettings = {
  version: 1,
  preset: "fire",
  enabled: true,
  autoPlay: true,
  seed: 1,
  duration: 5,
  looping: true,
  timeScale: 1,
  capacityScale: 1,
};

export function normalizeParticleEffectSettings(
  value: Partial<ParticleEffectSettings> | undefined,
): ParticleEffectSettings {
  return {
    ...defaultParticleEffectSettings,
    ...(value ?? {}),
    version: 1,
    preset: "fire",
    capacityScale: Math.max(0.05, Math.min(4, Number(value?.capacityScale ?? 1))),
    duration: Math.max(0.1, Number(value?.duration ?? defaultParticleEffectSettings.duration)),
    timeScale: Math.max(0, Number(value?.timeScale ?? defaultParticleEffectSettings.timeScale)),
    seed: Math.max(1, Math.floor(Number(value?.seed ?? defaultParticleEffectSettings.seed))),
    effectState: value?.effectState,
  };
}

export function particleSettingsSignature(settings: ParticleEffectSettings): string {
  return JSON.stringify(settings);
}
