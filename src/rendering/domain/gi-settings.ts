export type AmbientOcclusionSettings = {
  enabled: boolean;
  intensity: number; // 0..1 blend weight
  radius: number; // 0.05..2 view-space sample radius
  samples: number; // 4..32 sample budget
  thickness: number; // 0.25..2 occluder thickness assumption
  distanceFalloff: number; // 0..1
};

/** Screen-space reflection ray-march and roughness-blur controls. */
export type ScreenSpaceReflectionSettings = {
  enabled: boolean;
  maxDistance: number; // 0.1..50 world units
  thickness: number; // 0.01..2 hit tolerance
  opacity: number; // 0..1
  quality: number; // 0..1; changing it recompiles the quality-baked shader
  blurQuality: number; // integer 1..3
};
