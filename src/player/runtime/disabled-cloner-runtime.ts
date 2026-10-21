/** Player-only replacements for a scene with no enabled cloner objects. */
export function cloneCount(): number {
  return 0;
}

export function clonerHasAnimatedEffectors(): boolean {
  return false;
}

export function clonerSourceIds(): Set<string> {
  return new Set();
}

export function syncClonerOutputs(): boolean {
  return false;
}
