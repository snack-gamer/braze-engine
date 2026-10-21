import type { PhysicsVec3 } from "./components";

export type PhysicsWorldSettings = {
  gravity: PhysicsVec3;
  fixedTimestep: number;
  maxSubsteps: number;
};

export const DEFAULT_PHYSICS_WORLD_SETTINGS: Readonly<PhysicsWorldSettings> = {
  gravity: [0, -10, 0],
  fixedTimestep: 1 / 60,
  maxSubsteps: 5,
};

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(finiteNumber(value, fallback, min, max));
}

function gravityVector(value: unknown): PhysicsVec3 {
  // M0/M1 persisted a scalar Y gravity. Keep those projects lossless on load.
  if (!Array.isArray(value)) {
    return [0, finiteNumber(value, DEFAULT_PHYSICS_WORLD_SETTINGS.gravity[1], -1000, 1000), 0];
  }
  return [
    finiteNumber(value[0], 0, -1000, 1000),
    finiteNumber(value[1], DEFAULT_PHYSICS_WORLD_SETTINGS.gravity[1], -1000, 1000),
    finiteNumber(value[2], 0, -1000, 1000),
  ];
}

export function normalizePhysicsWorldSettings(value: unknown): PhysicsWorldSettings {
  const raw = value && typeof value === "object" ? value as Partial<PhysicsWorldSettings> : {};
  const defaults = DEFAULT_PHYSICS_WORLD_SETTINGS;
  return {
    gravity: gravityVector(raw.gravity),
    fixedTimestep: finiteNumber(raw.fixedTimestep, defaults.fixedTimestep, 1 / 1000, 1),
    maxSubsteps: integer(raw.maxSubsteps, defaults.maxSubsteps, 1, 64),
  };
}
