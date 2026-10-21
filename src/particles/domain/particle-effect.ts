export type ParticlePresetKind = "fire";

export type ParticleEffectSettings = {
  version: 1;
  preset: ParticlePresetKind;
  enabled: boolean;
  autoPlay: boolean;
  seed: number;
  duration: number;
  looping: boolean;
  timeScale: number;
  capacityScale: number;
  effectState?: Record<string, unknown>;
};
