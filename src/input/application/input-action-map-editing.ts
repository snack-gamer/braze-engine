import { INPUT_LIMITS, type InputAction, type InputActionMap, type InputBinding } from "../domain/action-map";

export function defaultInputBinding(device: InputBinding["device"]): InputBinding {
  switch (device) {
    case "keyboard": return { device, code: "Space", scale: 1 };
    case "pointer-button": return { device, button: 0, scale: 1 };
    case "pointer-delta": return { device, axis: "x", scale: 1 };
    case "gamepad-button": return { device, button: 0, scale: 1 };
    case "gamepad-axis": return { device, axis: 0, scale: 1, deadzone: 0.15 };
  }
}

export function appendInputAction(map: InputActionMap): InputActionMap {
  if (map.actions.length >= INPUT_LIMITS.actions) return map;
  const names = new Set(map.actions.map((action) => action.name));
  let suffix = 1;
  while (names.has(`Action${suffix}`)) suffix++;
  return { ...map, actions: [...map.actions, { name: `Action${suffix}`, kind: "button", bindings: [] }] };
}

export function changeInputActionKind(action: InputAction, kind: InputAction["kind"]): InputAction {
  return { ...action, kind, bindings: kind === "delta" ? action.bindings
    : action.bindings.filter((binding) => binding.device !== "pointer-delta") };
}
