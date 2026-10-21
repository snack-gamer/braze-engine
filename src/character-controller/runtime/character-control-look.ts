import type { CharacterControlLookSettings } from "../domain/character-control-settings";

export type CharacterControlOrientation = Readonly<{ yawDegrees: number; pitchDegrees: number }>;
export type CharacterControlLookInput = Readonly<{ deltaX: number; deltaY: number; rateX: number; rateY: number }>;

/** Positive yaw turns +Z toward +X; positive pitch looks down. Caller owns time. */
export function createCharacterControlLook(settings: CharacterControlLookSettings, initialYaw = 0) {
  const config = Object.freeze({ ...settings });
  if (![config.mouseSensitivity, config.gamepadLookSpeed, config.yawOffset, config.initialPitch, config.pitchMin, config.pitchMax].every(Number.isFinite) || config.mouseSensitivity < 0 || config.mouseSensitivity > 10
    || config.gamepadLookSpeed < 0 || config.gamepadLookSpeed > 720 || Math.abs(config.yawOffset) > 360_000
    || config.pitchMin < -89 || config.pitchMax > 89 || config.pitchMin > config.pitchMax
    || config.initialPitch < config.pitchMin || config.initialPitch > config.pitchMax) throw new Error("Invalid character look settings.");
  const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;
  let yaw = 0, pitch = config.initialPitch;
  const reset = (value = initialYaw) => {
    if (!Number.isFinite(value)) throw new Error("Character look needs a finite initial yaw.");
    yaw = wrap(value + config.yawOffset); pitch = config.initialPitch;
  };
  reset();
  return {
    step(input: CharacterControlLookInput, deltaSeconds: number): CharacterControlOrientation {
      if (![input.deltaX, input.deltaY, input.rateX, input.rateY].every(Number.isFinite) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.25) throw new Error("Character look needs finite input and a fixed timestep in (0, 0.25].");
      const rateX = Math.max(-1, Math.min(1, input.rateX)), rateY = Math.max(-1, Math.min(1, input.rateY));
      yaw = wrap(yaw + input.deltaX * config.mouseSensitivity + rateX * config.gamepadLookSpeed * deltaSeconds);
      pitch = Math.max(config.pitchMin, Math.min(config.pitchMax,
        pitch + input.deltaY * config.mouseSensitivity + rateY * config.gamepadLookSpeed * deltaSeconds));
      return Object.freeze({ yawDegrees: yaw, pitchDegrees: pitch });
    },
    reset,
  };
}
