import type { CameraConstraint } from "../../camera/domain/stock-camera-policy";
import { createFirstPersonCamera, createThirdPersonCamera, createTopDownCamera } from "../../camera/runtime/stock-camera-policies";
import { DEFAULT_FIRST_PERSON_CONTROL_SETTINGS, DEFAULT_THIRD_PERSON_CONTROL_SETTINGS, DEFAULT_TOP_DOWN_CONTROL_SETTINGS,
  resolveStockCharacterControlSettings, type StockCharacterControlOptions } from "../domain/stock-character-control-settings";
import { createCharacterControlPolicy, faceCharacterMovement, faceCharacterView, type CharacterControlPorts } from "./character-control-policy";

export function createFirstPersonControl(ports: CharacterControlPorts, options?: StockCharacterControlOptions) {
  const settings = resolveStockCharacterControlSettings(DEFAULT_FIRST_PERSON_CONTROL_SETTINGS, options);
  return createCharacterControlPolicy(ports, settings.control, ports.camera ? createFirstPersonCamera(settings.camera) : undefined, faceCharacterView);
}
export function createThirdPersonControl(ports: CharacterControlPorts, options?: StockCharacterControlOptions, constrain?: CameraConstraint) {
  const settings = resolveStockCharacterControlSettings(DEFAULT_THIRD_PERSON_CONTROL_SETTINGS, options);
  return createCharacterControlPolicy(ports, settings.control, ports.camera ? createThirdPersonCamera(settings.camera, constrain) : undefined, faceCharacterMovement);
}
export function createTopDownControl(ports: CharacterControlPorts, options?: StockCharacterControlOptions, constrain?: CameraConstraint) {
  const settings = resolveStockCharacterControlSettings(DEFAULT_TOP_DOWN_CONTROL_SETTINGS, options);
  return createCharacterControlPolicy(ports, settings.control, ports.camera ? createTopDownCamera(settings.camera, constrain) : undefined, faceCharacterMovement);
}
