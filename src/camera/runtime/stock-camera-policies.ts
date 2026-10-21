import type { GameCameraPose, GameVec3 } from "../../gameplay/domain/game-module";
import { DEFAULT_STOCK_CAMERA_SETTINGS, type CameraConstraint, type CameraPolicy,
  type CameraPolicyOrientation, type StockCameraSettings } from "../domain/stock-camera-policy";

const vector = (value: GameVec3) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
function capture(settings: StockCameraSettings) {
  if (![settings.pivotHeight, settings.shoulderOffset, settings.distance, settings.fov, settings.sharpness, settings.collisionRadius].every(Number.isFinite) || Math.abs(settings.pivotHeight) > 100
    || Math.abs(settings.shoulderOffset) > 100 || settings.distance < 0 || settings.distance > 100
    || settings.fov < 1 || settings.fov > 179 || settings.sharpness < 0 || settings.sharpness > 1000
    || settings.collisionRadius < 0 || settings.collisionRadius > 10) throw new Error("Invalid stock camera settings.");
  return Object.freeze({ ...settings });
}
function createCamera(settings: StockCameraSettings, firstPerson: boolean, constrain?: CameraConstraint): CameraPolicy {
  const config = capture(settings);
  if (!firstPerson && config.distance === 0) throw new Error("An orbit camera requires positive distance.");
  let previous: GameCameraPose | null = null;
  return {
    sample(position, orientation: CameraPolicyOrientation, deltaSeconds) {
      if (!vector(position) || !Number.isFinite(orientation.yawDegrees) || !Number.isFinite(orientation.pitchDegrees)
        || Math.abs(orientation.pitchDegrees) >= 90 || !Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 0.25) throw new Error("Invalid stock camera sample.");
      const yaw = orientation.yawDegrees * Math.PI / 180, pitch = orientation.pitchDegrees * Math.PI / 180;
      const forward: GameVec3 = [Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
      const pivot: GameVec3 = [position[0], position[1] + config.pivotHeight, position[2]];
      const desired: GameVec3 = firstPerson ? pivot : [pivot[0] - forward[0] * config.distance + Math.cos(yaw) * config.shoulderOffset,
        pivot[1] - forward[1] * config.distance, pivot[2] - forward[2] * config.distance - Math.sin(yaw) * config.shoulderOffset];
      const amount = !previous || config.sharpness === 0 ? 1 : 1 - Math.exp(-config.sharpness * deltaSeconds);
      const interpolated = desired.map((n, i) => (previous?.position[i] ?? n) + (n - (previous?.position[i] ?? n)) * amount) as unknown as GameVec3;
      const cameraPosition = !firstPerson && constrain && config.collisionRadius > 0 ? constrain(pivot, interpolated, config.collisionRadius) : interpolated;
      if (!vector(cameraPosition)) throw new Error("Camera constraint returned an invalid position.");
      // An overlapping static boom may collapse to the pivot: preserve a safe viewing direction.
      const target: GameVec3 = firstPerson || cameraPosition.every((n, i) => n === pivot[i])
        ? cameraPosition.map((n, i) => n + forward[i]) as unknown as GameVec3 : pivot;
      previous = Object.freeze({ position: Object.freeze([...cameraPosition]) as GameVec3, target: Object.freeze([...target]) as GameVec3, fov: config.fov });
      return previous;
    },
    reset() { previous = null; },
  };
}
export function createFirstPersonCamera(settings: StockCameraSettings = { ...DEFAULT_STOCK_CAMERA_SETTINGS, distance: 0 }): CameraPolicy {
  return createCamera(settings, true);
}
export function createThirdPersonCamera(settings: StockCameraSettings = DEFAULT_STOCK_CAMERA_SETTINGS, constrain?: CameraConstraint): CameraPolicy {
  return createCamera(settings, false, constrain);
}
export function createTopDownCamera(settings: StockCameraSettings = { ...DEFAULT_STOCK_CAMERA_SETTINGS, distance: 8 }, constrain?: CameraConstraint): CameraPolicy {
  return createCamera(settings, false, constrain);
}
