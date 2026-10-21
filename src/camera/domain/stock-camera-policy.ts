import type { GameCameraPose, GameVec3 } from "../../gameplay/domain/game-module";

export type StockCameraSettings = Readonly<{
  pivotHeight: number; shoulderOffset: number; distance: number;
  fov: number; sharpness: number; collisionRadius: number;
}>;
export type CameraPolicyOrientation = Readonly<{ yawDegrees: number; pitchDegrees: number }>;
export type CameraConstraint = (target: GameVec3, position: GameVec3, radius: number) => GameVec3;
export type CameraPolicy = Readonly<{
  sample: (position: GameVec3, orientation: CameraPolicyOrientation, deltaSeconds: number) => GameCameraPose;
  reset: () => void;
}>;
export const DEFAULT_STOCK_CAMERA_SETTINGS: StockCameraSettings = Object.freeze({
  pivotHeight: 0.6, shoulderOffset: 0, distance: 4, fov: 60, sharpness: 12, collisionRadius: 0.2,
});
