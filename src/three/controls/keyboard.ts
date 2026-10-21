import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { FocusController } from "./focus";

type KeyboardArgs = {
  controls: OrbitControls;
  transformControls: TransformControls;
  focus: FocusController;
};

function runtimeInputFocused(event: KeyboardEvent): boolean {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return Boolean(
    target?.closest('[data-runtime-input-surface="true"]')
    || focused?.closest('[data-runtime-input-surface="true"]'),
  );
}

// Window-level Alt watcher + F-focus key. Owns only the keyboard side of the
// viewport camera interactions; pointer drags live in pointer.ts.
export function installKeyboard(args: KeyboardArgs): { dispose: () => void } {
  const { controls, transformControls, focus } = args;

  const restoreTransformControls = () => {
    transformControls.enabled = transformControls.getHelper().visible;
  };

  // When Alt is held, enable LEFT-mouse orbit and disable RMB pan (so our
  // Alt+RMB drag dolly owns that gesture). When Alt releases, restore:
  // LEFT=null (plain click selects), RIGHT back to PAN. Listen at window so
  // alt-tab doesn't leave the state stuck.
  const onAltKey = (event: KeyboardEvent) => {
    if (runtimeInputFocused(event)) return;
    if (event.altKey) {
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      controls.mouseButtons.RIGHT = null;
      transformControls.enabled = false;
    } else {
      controls.mouseButtons.LEFT = null;
      controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      restoreTransformControls();
    }
  };
  const onWindowBlur = () => {
    controls.mouseButtons.LEFT = null;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    restoreTransformControls();
  };
  // F → focus on the selected object. Plain F only — modified F (Cmd+F
  // browser find, Ctrl+F, etc.) passes through. Guard against firing while
  // the user is typing in a text input or contenteditable field.
  const onFocusKey = (event: KeyboardEvent) => {
    if (runtimeInputFocused(event)) return;
    if (event.key.toLowerCase() !== "f") return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;
    event.preventDefault();
    focus.start();
  };

  window.addEventListener("keydown", onAltKey);
  window.addEventListener("keyup", onAltKey);
  window.addEventListener("keydown", onFocusKey);
  window.addEventListener("blur", onWindowBlur);

  return {
    dispose: () => {
      window.removeEventListener("keydown", onAltKey);
      window.removeEventListener("keyup", onAltKey);
      window.removeEventListener("keydown", onFocusKey);
      window.removeEventListener("blur", onWindowBlur);
    },
  };
}
