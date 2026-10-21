import type { EntityHandle } from "../../world/domain/entity-world";

type Vec3 = readonly [number, number, number];
export type GameCharacterTarget = string | EntityHandle;
export type GameCharacterMoveOptions = Readonly<{ /** Absolute world yaw in degrees. */ yawDegrees?: number }>;
export type GameCharacterResult = Readonly<{
  /** Last constrained object-origin command pose; dynamic GPU bodies are excluded from sweeps. */
  position: Vec3;
  grounded: boolean;
  scope: "static";
}>;
export type GameCharacterPose = GameCharacterResult & Readonly<{ yawDegrees: number }>;
export type GameCharacterMovementLease = Readonly<{
  entity: EntityHandle;
  snapshot: () => GameCharacterPose | null;
  move: (displacement: Vec3, options?: GameCharacterMoveOptions) => GameCharacterResult;
  release: () => void;
}>;
export type GameCharacters = Readonly<{
  /** Immutable command pose; null while physics is not ready. Never reads GPU simulation poses. */
  snapshot: (target: GameCharacterTarget) => GameCharacterPose | null;
  /** Exclusive writer until release, entity removal or Stop. Reads remain available to observers. */
  acquire: (target: GameCharacterTarget, ownerLabel?: string) => GameCharacterMovementLease;
  /** World-space metre displacement and optional yaw, accepted atomically during a fixed tick. */
  move: (target: GameCharacterTarget, displacement: Vec3, options?: GameCharacterMoveOptions) => GameCharacterResult;
}>;
