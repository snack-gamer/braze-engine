import { EMPTY_INPUT_ACTION, INPUT_LIMITS, type InputActionMap, type InputActionState, type InputBinding } from "../domain/action-map";
import { decodeInputActionMap } from "../serialization/action-map-codec";

export type GamepadSample = Readonly<{ axes: readonly number[]; buttons: readonly number[] }>;
const finite = (value: number | undefined) => Number.isFinite(value) ? value! : 0;
const clamp = (value: number, maximum = 1) => Math.max(-maximum, Math.min(maximum, value));

/** Bounded action state. DOM events collect changes; only a fixed tick consumes edges/deltas. */
export function createActionInput(initial: InputActionMap) {
  let map = decodeInputActionMap(initial);
  const keys = new Set<string>();
  const buttons = new Set<number>();
  const pressedKeys = new Set<string>();
  const pressedButtons = new Set<number>();
  const states = new Map<string, InputActionState>();
  let pointerX = 0, pointerY = 0;
  const reset = () => {
    keys.clear(); buttons.clear(); pressedKeys.clear(); pressedButtons.clear(); states.clear(); pointerX = 0; pointerY = 0;
  };
  const padValue = (binding: InputBinding, pads: readonly GamepadSample[]): number => {
    let result = 0;
    for (let i = 0; i < Math.min(pads.length, INPUT_LIMITS.gamepads); i += 1) {
      const pad = pads[i];
      let value = binding.device === "gamepad-axis" ? clamp(finite(pad.axes[binding.axis]))
        : binding.device === "gamepad-button" ? Math.max(0, clamp(finite(pad.buttons[binding.button]))) : 0;
      if (binding.device === "gamepad-axis") {
        const deadzone = binding.deadzone ?? 0.15;
        value = Math.sign(value) * Math.max(0, (Math.abs(value) - deadzone) / (1 - deadzone));
      }
      if (Math.abs(value) > Math.abs(result)) result = value;
    }
    return result;
  };
  return {
    action: (name: string): InputActionState => states.get(name) ?? EMPTY_INPUT_ACTION,
    bindings: () => map,
    usesKey: (code: string) => map.actions.some((action) => action.bindings.some((binding) => binding.device === "keyboard" && binding.code === code)),
    key(code: string, down: boolean) {
      if (down) { if (!keys.has(code)) pressedKeys.add(code); keys.add(code); } else keys.delete(code);
    },
    button(button: number, down: boolean) {
      if (down) { if (!buttons.has(button)) pressedButtons.add(button); buttons.add(button); } else buttons.delete(button);
    },
    pointer(dx: number, dy: number) { pointerX = clamp(pointerX + finite(dx), 2048); pointerY = clamp(pointerY + finite(dy), 2048); },
    reset,
    rebind(name: string, bindings: readonly InputBinding[]) {
      if (!map.actions.some((action) => action.name === name)) throw new Error(`Unknown input action ${name}.`);
      const next = decodeInputActionMap({ ...map, actions: map.actions.map((action) => action.name === name ? { ...action, bindings } : action) });
      map = next;
      reset();
    },
    advance(pads: readonly GamepadSample[] = []) {
      for (const action of map.actions) {
        let value = 0, tapped = false;
        for (const binding of action.bindings) {
          tapped ||= binding.device === "keyboard" ? pressedKeys.has(binding.code)
            : binding.device === "pointer-button" && pressedButtons.has(binding.button);
          const raw = binding.device === "keyboard" ? Number(keys.has(binding.code))
            : binding.device === "pointer-button" ? Number(buttons.has(binding.button))
              : binding.device === "pointer-delta" ? (binding.axis === "x" ? pointerX : pointerY)
                : padValue(binding, pads);
          value += raw * (binding.scale ?? 1);
        }
        value = clamp(value, action.kind === "delta" ? 2048 : 1);
        const held = Math.abs(value) > 0.5;
        const previous = states.get(action.name) ?? EMPTY_INPUT_ACTION;
        states.set(action.name, Object.freeze({ value, held, pressed: (held && !previous.held) || tapped, released: !held && (previous.held || tapped) }));
      }
      pressedKeys.clear(); pressedButtons.clear();
      pointerX = 0; pointerY = 0;
    },
  };
}

export type ActionInput = ReturnType<typeof createActionInput>;
