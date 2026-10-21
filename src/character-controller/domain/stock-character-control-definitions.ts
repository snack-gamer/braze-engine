import type { BehaviorField } from "../../behaviors/domain/behavior-registration";
import { DEFAULT_FIRST_PERSON_CONTROL_SETTINGS, DEFAULT_THIRD_PERSON_CONTROL_SETTINGS, DEFAULT_TOP_DOWN_CONTROL_SETTINGS,
  type StockCharacterControlSettings } from "./stock-character-control-settings";

const numeric = (key: string, label: string, value: number, min: number, max: number): BehaviorField => Object.freeze({ key, label, kind: "number", default: value, min, max });
function fields(settings: StockCharacterControlSettings): readonly BehaviorField[] {
  const { control: { actions, locomotion, look }, camera } = settings;
  return Object.freeze([
    ...Object.entries(actions).map(([key, value]): BehaviorField => Object.freeze({ key: `${key}Action`, label: `${key} action`, kind: "string", default: value, maxLength: 64 })),
    numeric("speed", "Move speed (m/s)", locomotion.speed, 0, 1000),
    numeric("gravity", "Gravity (m/s²)", locomotion.gravity, 0, 1000),
    numeric("jumpSpeed", "Jump speed (m/s)", locomotion.jumpSpeed, 0, 1000),
    numeric("mouseSensitivity", "Mouse sensitivity (degrees/pixel)", look.mouseSensitivity, 0, 10),
    numeric("gamepadLookSpeed", "Look rate (degrees/s)", look.gamepadLookSpeed, 0, 720),
    numeric("yawOffset", "Initial yaw offset (degrees)", look.yawOffset, -360_000, 360_000),
    numeric("initialPitch", "Initial pitch (degrees)", look.initialPitch, -89, 89),
    numeric("pitchMin", "Minimum pitch (degrees)", look.pitchMin, -89, 89),
    numeric("pitchMax", "Maximum pitch (degrees)", look.pitchMax, -89, 89),
    Object.freeze({ key: "cameraEnabled", label: "Control camera", kind: "boolean", default: true }) as BehaviorField,
    numeric("pivotHeight", "Camera pivot height (m)", camera.pivotHeight, -100, 100),
    numeric("shoulderOffset", "Camera shoulder offset (m)", camera.shoulderOffset, -100, 100),
    numeric("distance", "Camera distance (m)", camera.distance, 0, 100),
    numeric("fov", "Field of view (degrees)", camera.fov, 1, 179),
    numeric("sharpness", "Camera response (1/s)", camera.sharpness, 0, 1000),
    numeric("collisionRadius", "Static camera clearance radius (m)", camera.collisionRadius, 0, 10),
  ]);
}
const definition = (id: string, label: string, settings: StockCharacterControlSettings, omitted: readonly string[] = []) => Object.freeze({
  id, label, version: 1, fields: Object.freeze(fields(settings).filter((field) => !omitted.includes(field.key))),
});
export const STOCK_CHARACTER_CONTROL_DEFINITIONS = Object.freeze([
  definition("braze.control.first-person", "First-person control", DEFAULT_FIRST_PERSON_CONTROL_SETTINGS, ["distance", "shoulderOffset", "collisionRadius"]),
  definition("braze.control.third-person", "Third-person control", DEFAULT_THIRD_PERSON_CONTROL_SETTINGS),
  definition("braze.control.top-down", "Top-down control", DEFAULT_TOP_DOWN_CONTROL_SETTINGS),
]);
