import { INPUT_LIMITS } from "../domain/action-map-limits.mjs";

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Input map values must be objects.");
  return value;
}

function index(value, maximum) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= maximum) {
    throw new Error(`Input index must be an integer between 0 and ${maximum - 1}.`);
  }
  return value;
}

function binding(value, kind) {
  const raw = record(value);
  const scale = raw.scale ?? 1;
  if (typeof scale !== "number" || !Number.isFinite(scale) || Math.abs(scale) > 100 || scale === 0) {
    throw new Error("Input binding scale must be finite, nonzero and within [-100, 100].");
  }
  switch (raw.device) {
    case "keyboard":
      if (typeof raw.code !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(raw.code)) throw new Error("Invalid keyboard code.");
      return Object.freeze({ device: raw.device, code: raw.code, scale });
    case "pointer-button":
      return Object.freeze({ device: raw.device, button: index(raw.button, 5), scale });
    case "pointer-delta":
      if (kind !== "delta" || (raw.axis !== "x" && raw.axis !== "y")) throw new Error("Pointer motion requires a delta action and x/y axis.");
      return Object.freeze({ device: raw.device, axis: raw.axis, scale });
    case "gamepad-button":
      return Object.freeze({ device: raw.device, button: index(raw.button, INPUT_LIMITS.buttons), scale });
    case "gamepad-axis": {
      const deadzone = raw.deadzone ?? 0.15;
      if (typeof deadzone !== "number" || !Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) throw new Error("Gamepad deadzone must be in [0, 1).");
      return Object.freeze({ device: raw.device, axis: index(raw.axis, INPUT_LIMITS.axes), scale, deadzone });
    }
    default: throw new Error(`Unsupported input device ${String(raw.device)}.`);
  }
}

/** Rejects incompatible versions and malformed replacements before changing live input. */
export function decodeInputActionMap(value) {
  const raw = record(value);
  if (raw.version !== 1) throw new Error(`Unsupported input map version ${String(raw.version)}.`);
  if (!Array.isArray(raw.actions) || raw.actions.length > INPUT_LIMITS.actions) throw new Error(`Input maps allow at most ${INPUT_LIMITS.actions} actions.`);
  const names = new Set();
  const actions = raw.actions.map((value) => {
    const action = record(value);
    if (typeof action.name !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(action.name) || names.has(action.name)) throw new Error("Input actions require unique valid names.");
    if (action.kind !== "button" && action.kind !== "axis" && action.kind !== "delta") throw new Error("Unsupported input action kind.");
    if (!Array.isArray(action.bindings) || action.bindings.length > INPUT_LIMITS.bindings) throw new Error(`Input actions allow at most ${INPUT_LIMITS.bindings} bindings.`);
    names.add(action.name);
    const kind = action.kind;
    return Object.freeze({ name: action.name, kind, bindings: Object.freeze(action.bindings.map((value) => binding(value, kind))) });
  });
  return Object.freeze({ version: 1, actions: Object.freeze(actions) });
}

export function encodeInputActionMap(value) {
  return JSON.stringify(decodeInputActionMap(value));
}
