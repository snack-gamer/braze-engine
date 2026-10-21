/** Player-only replacement for the Three/particle base-pass seam in particle-free scenes. */
export function installThreeR184ParticleBasePassBridge() {
  return Object.freeze({
    setEnabled: (_enabled: boolean) => undefined,
    dispose: () => undefined,
  });
}
