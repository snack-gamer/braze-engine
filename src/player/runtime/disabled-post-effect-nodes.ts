function unavailable(name: string): never {
  throw new Error(`${name} is not part of this scene-compiled player build.`);
}

/** Player-only replacement for post-effect implementations absent from the scene. */
export function ao(): never {
  return unavailable("Ambient occlusion");
}

export function bloom(): never {
  return unavailable("Bloom");
}

export function ssr(): never {
  return unavailable("Screen-space reflections");
}
