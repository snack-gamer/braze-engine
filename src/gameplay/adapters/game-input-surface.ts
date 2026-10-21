import { attachBrowserGameInput } from "../../input/adapters/browser-game-input";
import { createActionInput } from "../../input/runtime/action-input";
import type { GameInput, InputActionMap } from "../../input/domain/action-map";

/** Bindings belong to Play; DOM listeners belong to the currently attached surface. */
export function createGameInputSurface(map: InputActionMap) {
  const input = createActionInput(map);
  let binding: ReturnType<typeof attachBrowserGameInput> | null = null;
  let enabled = false, disposed = false;
  const captures = new Set<object>();
  const port: GameInput = Object.freeze({
    action: input.action,
    bindings: input.bindings,
    rebind(name, bindings) {
      if (disposed) throw new Error("This gameplay session has ended.");
      input.rebind(name, bindings);
    },
    async requestPointerLock() {
      if (disposed || !binding) throw new Error("Focus the active Game viewport before requesting pointer lock.");
      await binding.port.requestPointerLock();
    },
    releasePointerLock() { binding?.port.releasePointerLock(); },
    pointerLockStatus: () => binding?.port.pointerLockStatus() ?? Object.freeze({ status: "unlocked" as const }),
    capturePointerLock(value) {
      if (disposed) throw new Error("This gameplay session has ended.");
      if (typeof value !== "boolean") throw new Error("Pointer lock capture must be a boolean.");
      if (!value) return () => undefined;
      if (captures.size >= 16) throw new Error("Pointer lock policy capacity exceeded (16).");
      const token = {};
      captures.add(token); binding?.setPointerLockCapture(true);
      return () => { if (captures.delete(token) && !captures.size) binding?.setPointerLockCapture(false); };
    },
  });
  return {
    port,
    attach(surface: HTMLElement) {
      if (disposed) return () => undefined;
      binding?.dispose();
      const current = attachBrowserGameInput(surface, input);
      binding = current; current.setEnabled(enabled); current.setPointerLockCapture?.(captures.size > 0);
      return () => { current.dispose(); if (binding === current) binding = null; };
    },
    advance(suppressed = false) { if (suppressed) { input.reset(); return; } if (binding) binding.advance(); else input.reset(); },
    setEnabled(value: boolean) {
      if (enabled === value) return;
      enabled = value; binding?.setEnabled(value);
      if (!value) input.reset();
    },
    dispose() { disposed = true; captures.clear(); binding?.dispose(); binding = null; input.reset(); },
  };
}
