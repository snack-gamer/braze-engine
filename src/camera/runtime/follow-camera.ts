import type { GameCameraPose, GameVec3 } from "../../gameplay/domain/game-module";

export type FollowCameraSettings = Readonly<{
  /** World-space camera and aim offsets from a caller-owned target pose. */
  offset: GameVec3;
  targetOffset: GameVec3;
  fov: number;
  /** Exponential response in inverse seconds; zero means an immediate cut. */
  sharpness: number;
}>;

const blend = (a: GameVec3, b: GameVec3, t: number): GameVec3 => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];
const add = (a: GameVec3, b: GameVec3): GameVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const finiteVector = (value: GameVec3) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

/** Clockless camera policy usable for first-person, third-person and top-down offsets. */
export function createFollowCamera(settings: FollowCameraSettings) {
  if (!finiteVector(settings.offset) || !finiteVector(settings.targetOffset)
    || settings.offset.every((value, index) => value === settings.targetOffset[index])
    || !Number.isFinite(settings.fov) || settings.fov < 1 || settings.fov > 179
    || !Number.isFinite(settings.sharpness) || settings.sharpness < 0) throw new Error("Invalid follow-camera settings.");
  const config = { ...settings, offset: [...settings.offset] as GameVec3, targetOffset: [...settings.targetOffset] as GameVec3 };
  let previous: GameCameraPose | null = null;
  const pose = (target: GameVec3): GameCameraPose => ({
    position: add(target, config.offset), target: add(target, config.targetOffset), fov: config.fov,
  });
  return {
    sample(target: GameVec3, deltaSeconds: number): GameCameraPose {
      if (!finiteVector(target) || !Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("Invalid follow-camera sample.");
      const desired = pose(target);
      const amount = !previous || config.sharpness === 0 ? 1 : 1 - Math.exp(-config.sharpness * deltaSeconds);
      previous = Object.freeze({
        position: Object.freeze(blend(previous?.position ?? desired.position, desired.position, amount)),
        target: Object.freeze(blend(previous?.target ?? desired.target, desired.target, amount)), fov: desired.fov,
      });
      return previous;
    },
    reset() { previous = null; },
  };
}
