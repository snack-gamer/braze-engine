/** Player-only replacement for scene-authoring pointer and transform input. */
export function installInputs() {
  return Object.freeze({
    dispose: () => undefined,
    tickFocus: () => false,
    focusSelection: () => undefined,
    cancelFocus: () => undefined,
  });
}

export function syncTransformControls(): void {}

export function createViewportNavigationGizmo() {
  return Object.freeze({
    update: (_now?: number) => false,
    destroy: () => undefined,
  });
}
