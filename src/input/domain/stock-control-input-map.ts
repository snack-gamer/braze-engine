import type { InputAction, InputActionMap } from "./action-map";

/** One reusable map for stock and scripted controls; gamepad look rates stay separate from pixels. */
export function createStockControlInputMap(): InputActionMap {
  const actions: InputAction[] = [
    { name: "moveX", kind: "axis", bindings: [{ device: "keyboard", code: "KeyA", scale: -1 }, { device: "keyboard", code: "KeyD" }, { device: "gamepad-axis", axis: 0 }] },
    { name: "moveZ", kind: "axis", bindings: [{ device: "keyboard", code: "KeyW" }, { device: "keyboard", code: "KeyS", scale: -1 }, { device: "gamepad-axis", axis: 1, scale: -1 }] },
    { name: "jump", kind: "button", bindings: [{ device: "keyboard", code: "Space" }, { device: "gamepad-button", button: 0 }] },
    { name: "lookX", kind: "delta", bindings: [{ device: "pointer-delta", axis: "x" }] },
    { name: "lookY", kind: "delta", bindings: [{ device: "pointer-delta", axis: "y" }] },
    { name: "lookRateX", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 2 }] },
    { name: "lookRateY", kind: "axis", bindings: [{ device: "gamepad-axis", axis: 3 }] },
  ];
  return Object.freeze({ version: 1, actions: Object.freeze(actions.map((action) => Object.freeze({ ...action,
    bindings: Object.freeze(action.bindings.map((binding) => Object.freeze({ ...binding }))) }))) });
}
