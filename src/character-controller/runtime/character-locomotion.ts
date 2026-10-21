import type { GameCharacterResult, GameVec3 } from "../../gameplay/domain/game-module";

export type CharacterLocomotionSettings = Readonly<{ speed: number; gravity: number; jumpSpeed: number }>;

/** Caller-clocked Y-up movement. Every displacement goes through the existing character motor. */
export function createCharacterLocomotion(
  move: (displacement: GameVec3) => GameCharacterResult,
  settings: CharacterLocomotionSettings = { speed: 4, gravity: 9.81, jumpSpeed: 5 },
) {
  if (![settings.speed, settings.gravity, settings.jumpSpeed].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Locomotion settings must be finite nonnegative numbers.");
  const { speed, gravity, jumpSpeed } = settings;
  let velocityY = 0, grounded = false;
  let previous: GameCharacterResult | null = null;
  return {
    step(input: Readonly<{ x: number; z: number; jump: boolean }>, deltaSeconds: number) {
      if (![input.x, input.z, deltaSeconds].every(Number.isFinite) || deltaSeconds <= 0 || deltaSeconds > 0.25) throw new Error("Locomotion needs finite input and a fixed timestep in (0, 0.25].");
      const divisor = Math.max(1, Math.hypot(input.x, input.z));
      if (input.jump && grounded) { velocityY = jumpSpeed; grounded = false; }
      // Exact constant-acceleration displacement makes free flight cadence independent.
      const dy = velocityY * deltaSeconds - 0.5 * gravity * deltaSeconds * deltaSeconds;
      velocityY -= gravity * deltaSeconds;
      const result = move([input.x / divisor * speed * deltaSeconds, dy, input.z / divisor * speed * deltaSeconds]);
      grounded = result.grounded;
      if (grounded && velocityY < 0) velocityY = 0;
      if (previous && dy > 0 && result.position[1] - previous.position[1] < dy - 1e-4) velocityY = Math.min(0, velocityY);
      previous = result;
      return result;
    },
    reset() { velocityY = 0; grounded = false; previous = null; },
  };
}
