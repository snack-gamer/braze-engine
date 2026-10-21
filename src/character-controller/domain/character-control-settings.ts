export type CharacterControlActions = Readonly<{
  moveX: string; moveZ: string; jump: string;
  lookX: string; lookY: string; lookRateX: string; lookRateY: string;
}>;
export type CharacterControlLookSettings = Readonly<{
  /** Degrees per accumulated pointer pixel; never multiplied by time. */
  mouseSensitivity: number;
  /** Degrees per second for normalized rate actions. */
  gamepadLookSpeed: number;
  yawOffset: number; initialPitch: number; pitchMin: number; pitchMax: number;
}>;
export type CharacterControlSettings = Readonly<{
  actions: CharacterControlActions;
  locomotion: Readonly<{ speed: number; gravity: number; jumpSpeed: number }>;
  look: CharacterControlLookSettings;
}>;
export const DEFAULT_CHARACTER_CONTROL_ACTIONS: CharacterControlActions = Object.freeze({
  moveX: "moveX", moveZ: "moveZ", jump: "jump", lookX: "lookX", lookY: "lookY",
  lookRateX: "lookRateX", lookRateY: "lookRateY",
});
export const DEFAULT_CHARACTER_CONTROL_SETTINGS: CharacterControlSettings = Object.freeze({
  actions: DEFAULT_CHARACTER_CONTROL_ACTIONS,
  locomotion: Object.freeze({ speed: 4, gravity: 9.81, jumpSpeed: 5 }),
  look: Object.freeze({ mouseSensitivity: 0.12, gamepadLookSpeed: 120,
    yawOffset: 0, initialPitch: 0, pitchMin: -85, pitchMax: 85 }),
});
