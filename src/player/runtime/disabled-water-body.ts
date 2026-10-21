function unavailable(): never {
  throw new Error("Water bodies are not part of this scene-compiled player build.");
}

/** Player-only replacements for scenes containing no authored water body. */
export function waterBodyKey(): never {
  return unavailable();
}

export function buildWaterBody(): never {
  return unavailable();
}

export function syncWaterBody(): never {
  return unavailable();
}
