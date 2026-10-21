import type { ParticleEffect } from "@particles/core";
import { loadEffectState, saveEffectState } from "@particles/editor";

export type SerializedParticleEffectState = Record<string, unknown>;

const TRANSFER_KEY = "tgan.particles.transfer";

export function applySerializedParticleEffect(
  effect: ParticleEffect,
  state: SerializedParticleEffectState | undefined,
): boolean {
  if (!state) return false;
  try {
    localStorage.setItem(TRANSFER_KEY, JSON.stringify(state));
    return loadEffectState(effect, TRANSFER_KEY);
  } catch {
    return false;
  } finally {
    try {
      localStorage.removeItem(TRANSFER_KEY);
    } catch {
      // ignored
    }
  }
}

export function serializeParticleEffect(effect: ParticleEffect): SerializedParticleEffectState | undefined {
  try {
    saveEffectState(effect, TRANSFER_KEY);
    const raw = localStorage.getItem(TRANSFER_KEY);
    return raw ? JSON.parse(raw) as SerializedParticleEffectState : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      localStorage.removeItem(TRANSFER_KEY);
    } catch {
      // ignored
    }
  }
}
