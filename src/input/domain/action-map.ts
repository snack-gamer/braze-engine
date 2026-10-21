export type InputBinding =
  | Readonly<{ device: "keyboard"; code: string; scale?: number }>
  | Readonly<{ device: "pointer-button"; button: number; scale?: number }>
  | Readonly<{ device: "pointer-delta"; axis: "x" | "y"; scale?: number }>
  | Readonly<{ device: "gamepad-button"; button: number; scale?: number }>
  | Readonly<{ device: "gamepad-axis"; axis: number; scale?: number; deadzone?: number }>;

export type InputAction = Readonly<{
  name: string;
  kind: "button" | "axis" | "delta";
  bindings: readonly InputBinding[];
}>;

export type InputActionMap = Readonly<{ version: 1; actions: readonly InputAction[] }>;
export type InputActionState = Readonly<{ value: number; held: boolean; pressed: boolean; released: boolean }>;
export const EMPTY_INPUT_ACTION: InputActionState = Object.freeze({ value: 0, held: false, pressed: false, released: false });
export const EMPTY_INPUT_MAP: InputActionMap = Object.freeze({ version: 1, actions: Object.freeze([]) });
export { INPUT_LIMITS } from "./action-map-limits.mjs";

export type GameInput = Readonly<{
  action: (name: string) => InputActionState;
  rebind: (name: string, bindings: readonly InputBinding[]) => void;
  bindings: () => InputActionMap;
  requestPointerLock: () => Promise<void>;
  releasePointerLock: () => void;
  /** Request lock directly from primary clicks on the active Game surface. */
  capturePointerLock: (enabled: boolean) => () => void;
  pointerLockStatus: () => Readonly<{ status: "unlocked" | "requesting" | "locked" | "rejected"; message?: string }>;
}>;
